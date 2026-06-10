import {FileUtils, RattaFileSelector} from 'sn-plugin-lib';
import type {
  Deck,
  Flashcard,
  FlashcardDatabase,
  ImportCardInput,
} from '../types/flashcards';
import {readTextFile, writeTextFile} from './nativeStorage';
import {fingerprintCard} from './store';

const HEADERS = ['Deck', 'Question', 'Answer', 'ExternalId', 'UpdatedAt'];

const cleanCell = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .trim();

const escapeCell = (value: string) => cleanCell(value).replace(/\n/g, '<br>');

const unescapeCell = (value: string) =>
  value
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/""/g, '"')
    .replace(/<br\s*\/?>/gi, '\n');

const splitDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map(unescapeCell);
};

const normalizeHeader = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

const hasHeader = (cells: string[]) => {
  const headers = cells.map(normalizeHeader);
  return (
    headers.includes('question') ||
    headers.includes('front') ||
    headers.includes('answer') ||
    headers.includes('back')
  );
};

const valueByHeader = (
  cells: string[],
  headerMap: Record<string, number>,
  names: string[],
) => {
  for (const name of names) {
    const index = headerMap[name];
    if (typeof index === 'number') {
      return cells[index] ?? '';
    }
  }
  return '';
};

export const parseCardText = (
  text: string,
  fallbackDeckName: string,
): ImportCardInput[] => {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n').filter(line => line.trim().length > 0);
  if (rawLines.length === 0) {
    return [];
  }

  const delimiter = rawLines[0].includes('\t') ? '\t' : ',';
  const firstCells = splitDelimitedLine(rawLines[0], delimiter);
  const headered = hasHeader(firstCells);
  const headers = headered ? firstCells.map(normalizeHeader) : [];
  const headerMap = headers.reduce<Record<string, number>>((map, header, index) => {
    map[header] = index;
    return map;
  }, {});
  const lines = headered ? rawLines.slice(1) : rawLines;

  return lines
    .map(line => {
      const cells = splitDelimitedLine(line, delimiter);
      if (headered) {
        return {
          deckName:
            valueByHeader(cells, headerMap, ['deck', 'deckname']) ||
            fallbackDeckName,
          question: valueByHeader(cells, headerMap, ['question', 'front']),
          answer: valueByHeader(cells, headerMap, ['answer', 'back']),
          externalId: valueByHeader(cells, headerMap, [
            'externalid',
            'noteid',
            'cardid',
            'id',
          ]),
          externalUpdatedAt: valueByHeader(cells, headerMap, [
            'updatedat',
            'modified',
            'mod',
          ]),
        };
      }

      if (cells.length >= 3) {
        return {
          deckName: cells[0] || fallbackDeckName,
          question: cells[1],
          answer: cells[2],
          externalId: cells[3],
          externalUpdatedAt: cells[4],
        };
      }

      return {
        deckName: fallbackDeckName,
        question: cells[0] ?? '',
        answer: cells[1] ?? '',
        externalId: cells[2],
        externalUpdatedAt: cells[3],
      };
    })
    .filter(row => row.question.trim() && row.answer.trim());
};

export const buildDeckTsv = (
  deck: Deck,
  cards: Flashcard[],
) => {
  const rows = cards.map(card => {
    const externalId =
      card.externalId || fingerprintCard(deck.name, card.question, card.answer);
    return [
      deck.name,
      card.question,
      card.answer,
      externalId,
      card.externalUpdatedAt || card.updatedAt,
    ]
      .map(escapeCell)
      .join('\t');
  });

  return [HEADERS.join('\t'), ...rows].join('\n') + '\n';
};

const safeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_\- ]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'Deck';

export const exportDeckToTsv = async (
  db: FlashcardDatabase,
  deck: Deck,
  cards: Flashcard[],
) => {
  const exportPath = await FileUtils.getExportPath();
  const filePath = `${exportPath}/${safeFileName(deck.name)}.tsv`;
  await writeTextFile(filePath, buildDeckTsv(deck, cards));
  return filePath;
};

export const pickImportTextFile = async () => {
  const selected = await RattaFileSelector.selectFile({
    selectType: 1,
    suffixList: ['tsv', 'csv', 'txt'],
    maxNum: 1,
    title: 'Import Flashcards',
    rightButtonText: 'Import',
  });
  const path = selected?.[0];
  if (!path) {
    return null;
  }

  return {
    path,
    text: (await readTextFile(path)) ?? '',
  };
};

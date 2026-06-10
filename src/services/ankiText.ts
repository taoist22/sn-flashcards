import {FileUtils, RattaFileSelector} from 'sn-plugin-lib';
import type {
  Deck,
  Flashcard,
  ImportCardInput,
} from '../types/flashcards';
import {readTextFile, writeTextFile} from './nativeStorage';
import {fingerprintCard} from './store';

const cleanCell = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .trim();

const escapeAnkiPlainTextCell = (value: string) =>
  cleanCell(value).replace(/\n/g, ' ');

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

type AnkiDirectives = {
  delimiter?: string;
  guidColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  noteTypeColumn?: number;
};

const parseColumnDirective = (line: string, name: string) => {
  const pattern = new RegExp(`^#${name} column:(\\d+)$`, 'i');
  const match = line.trim().match(pattern);
  if (!match) {
    return undefined;
  }

  return Number(match[1]) - 1;
};

const parseAnkiDirectives = (lines: string[]): AnkiDirectives => {
  const directives: AnkiDirectives = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.match(/^#separator:(.+)$/i)?.[1];
    if (separator) {
      directives.delimiter =
        separator.toLocaleLowerCase() === 'tab' ? '\t' : separator;
    }

    directives.guidColumn =
      parseColumnDirective(trimmed, 'guid') ?? directives.guidColumn;
    directives.deckColumn =
      parseColumnDirective(trimmed, 'deck') ?? directives.deckColumn;
    directives.tagsColumn =
      parseColumnDirective(trimmed, 'tags') ?? directives.tagsColumn;
    directives.noteTypeColumn =
      parseColumnDirective(trimmed, 'notetype') ?? directives.noteTypeColumn;
  }

  return directives;
};

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

  const directives = parseAnkiDirectives(rawLines);
  const dataLines = rawLines.filter(line => !line.trim().startsWith('#'));
  if (dataLines.length === 0) {
    return [];
  }

  const delimiter =
    directives.delimiter ?? (dataLines[0].includes('\t') ? '\t' : ',');
  const firstCells = splitDelimitedLine(dataLines[0], delimiter);
  const headered = hasHeader(firstCells);
  const headers = headered ? firstCells.map(normalizeHeader) : [];
  const headerMap = headers.reduce<Record<string, number>>((map, header, index) => {
    map[header] = index;
    return map;
  }, {});
  const lines = headered ? dataLines.slice(1) : dataLines;
  const specialColumns = [
    directives.guidColumn,
    directives.deckColumn,
    directives.tagsColumn,
    directives.noteTypeColumn,
  ].filter((value): value is number => typeof value === 'number');

  return lines
    .map(line => {
      const cells = splitDelimitedLine(line, delimiter);
      if (!headered && specialColumns.length > 0) {
        const contentCells = cells.filter(
          (_, index) => !specialColumns.includes(index),
        );

        return {
          deckName:
            typeof directives.deckColumn === 'number'
              ? cells[directives.deckColumn] || fallbackDeckName
              : fallbackDeckName,
          question: contentCells[0] ?? '',
          answer: contentCells[1] ?? '',
          externalId:
            typeof directives.guidColumn === 'number'
              ? cells[directives.guidColumn]
              : undefined,
        };
      }

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

export const buildAnkiPlainTextExport = (
  deck: Deck,
  cards: Flashcard[],
) => {
  const rows = cards.map(card => {
    const externalId =
      card.externalId || fingerprintCard(deck.name, card.question, card.answer);
    return [
      externalId,
      deck.name,
      card.question,
      card.answer,
    ]
      .map(escapeAnkiPlainTextCell)
      .join('\t');
  });

  return [
    '#separator:tab',
    '#html:false',
    '#guid column:1',
    '#deck column:2',
    ...rows,
  ].join('\n') + '\n';
};

const safeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_\- ]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'Deck';

export const exportDeckToAnkiText = async (
  deck: Deck,
  cards: Flashcard[],
) => {
  const exportPath = await FileUtils.getExportPath();
  const filePath = `${exportPath}/${safeFileName(deck.name)}-anki.txt`;
  await writeTextFile(filePath, buildAnkiPlainTextExport(deck, cards));
  return filePath;
};

export const pickImportTextFile = async () => {
  const selected = await RattaFileSelector.selectFile({
    selectType: 0,
    maxNum: 1,
    title: 'Import Anki Text',
    rightButtonText: 'Import',
  });
  const path = selected?.[0];
  if (!path) {
    return null;
  }

  const lowerPath = path.toLocaleLowerCase();
  if (
    !lowerPath.endsWith('.txt') &&
    !lowerPath.endsWith('.tsv') &&
    !lowerPath.endsWith('.csv')
  ) {
    throw new Error('Choose an Anki .txt, .tsv, or .csv text export.');
  }

  return {
    path,
    text: (await readTextFile(path)) ?? '',
  };
};

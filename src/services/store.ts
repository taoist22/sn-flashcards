import type {
  AddCardInput,
  Deck,
  Flashcard,
  FlashcardDatabase,
  ImportCardInput,
  ImportSummary,
  NoteDeckDefault,
  ReviewEntry,
  UpdateCardInput,
} from '../types/flashcards';
import {createInitialFsrsCard, scheduleReview} from './fsrsScheduler';
import type {Grade} from 'ts-fsrs';
import {readDatabaseJson, writeDatabaseJson} from './nativeStorage';

const nowIso = () => new Date().toISOString();

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const normalizeName = (value: string) => value.trim().toLocaleLowerCase();

const normalizeNoteDefaults = (
  noteDefaults: unknown,
  decks: Deck[],
): NoteDeckDefault[] => {
  if (!Array.isArray(noteDefaults)) {
    return [];
  }

  const deckIds = new Set(decks.map(deck => deck.id));
  return noteDefaults.filter(
    (item): item is NoteDeckDefault => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const candidate = item as Partial<NoteDeckDefault>;
      return (
        typeof candidate.notePath === 'string' &&
        typeof candidate.deckId === 'string' &&
        typeof candidate.updatedAt === 'string' &&
        deckIds.has(candidate.deckId)
      );
    },
  );
};

export const fingerprintCard = (
  deckName: string,
  question: string,
  answer: string,
) => {
  const source = `${normalizeName(deckName)}\n${question.trim()}\n${answer.trim()}`;
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return `fingerprint:${(hash >>> 0).toString(36)}`;
};

const findOrCreateDeck = (
  decks: Deck[],
  deckName: string,
): {decks: Deck[]; deckId: string; created: boolean} => {
  const normalized = normalizeName(deckName);
  const existing = decks.find(deck => normalizeName(deck.name) === normalized);
  if (existing) {
    return {decks, deckId: existing.id, created: false};
  }

  const now = nowIso();
  const deck = {
    id: newId('deck'),
    name: deckName.trim() || 'Imported',
    createdAt: now,
    updatedAt: now,
  };
  return {decks: [...decks, deck], deckId: deck.id, created: true};
};

const createDefaultDb = (): FlashcardDatabase => {
  const now = nowIso();
  return {
    version: 1,
    decks: [
      {
        id: newId('deck'),
        name: 'Default',
        createdAt: now,
        updatedAt: now,
      },
    ],
    cards: [],
    reviews: [],
    noteDefaults: [],
  };
};

const normalizeDb = (db: Partial<FlashcardDatabase>): FlashcardDatabase => {
  if (!Array.isArray(db.decks) || db.decks.length === 0) {
    return createDefaultDb();
  }

  return {
    version: 1,
    decks: db.decks,
    cards: Array.isArray(db.cards) ? db.cards : [],
    reviews: Array.isArray(db.reviews) ? db.reviews : [],
    noteDefaults: normalizeNoteDefaults(db.noteDefaults, db.decks),
  };
};

export const loadDatabase = async (): Promise<FlashcardDatabase> => {
  const raw = await readDatabaseJson();
  if (!raw) {
    const db = createDefaultDb();
    await saveDatabase(db);
    return db;
  }

  try {
    return normalizeDb(JSON.parse(raw));
  } catch {
    const db = createDefaultDb();
    await saveDatabase(db);
    return db;
  }
};

export const saveDatabase = async (db: FlashcardDatabase) => {
  await writeDatabaseJson(JSON.stringify(db));
};

export const createDeck = async (
  db: FlashcardDatabase,
  name: string,
): Promise<FlashcardDatabase> => {
  const trimmed = name.trim();
  if (!trimmed) {
    return db;
  }

  const now = nowIso();
  const next = {
    ...db,
    decks: [
      ...db.decks,
      {id: newId('deck'), name: trimmed, createdAt: now, updatedAt: now},
    ],
  };
  await saveDatabase(next);
  return next;
};

export const deleteDeck = async (
  db: FlashcardDatabase,
  deckId: string,
): Promise<FlashcardDatabase> => {
  if (db.decks.length <= 1) {
    return db;
  }

  const remainingDecks = db.decks.filter(deck => deck.id !== deckId);
  const fallbackDeckId = remainingDecks[0]?.id;
  const next = {
    ...db,
    decks: remainingDecks,
    cards: db.cards.map(card =>
      card.deckId === deckId ? {...card, deckId: fallbackDeckId} : card,
    ),
    noteDefaults: db.noteDefaults.filter(item => item.deckId !== deckId),
  };
  await saveDatabase(next);
  return next;
};

export const setNoteDefaultDeck = async (
  db: FlashcardDatabase,
  notePath: string,
  deckId: string,
): Promise<FlashcardDatabase> => {
  const trimmedPath = notePath.trim();
  if (!trimmedPath || !db.decks.some(deck => deck.id === deckId)) {
    return db;
  }

  const now = nowIso();
  const next = {
    ...db,
    noteDefaults: [
      ...db.noteDefaults.filter(item => item.notePath !== trimmedPath),
      {notePath: trimmedPath, deckId, updatedAt: now},
    ],
  };
  await saveDatabase(next);
  return next;
};

export const clearNoteDefaultDeck = async (
  db: FlashcardDatabase,
  notePath: string,
): Promise<FlashcardDatabase> => {
  const trimmedPath = notePath.trim();
  if (!trimmedPath) {
    return db;
  }

  const next = {
    ...db,
    noteDefaults: db.noteDefaults.filter(item => item.notePath !== trimmedPath),
  };
  await saveDatabase(next);
  return next;
};

export const addCard = async (
  db: FlashcardDatabase,
  input: AddCardInput,
): Promise<FlashcardDatabase> => {
  const now = nowIso();
  const card: Flashcard = {
    id: newId('card'),
    deckId: input.deckId,
    externalId: input.externalId,
    externalUpdatedAt: input.externalUpdatedAt,
    question: input.question.trim(),
    answer: input.answer.trim(),
    sourceNotePath: input.sourceNotePath,
    sourcePage: input.sourcePage,
    createdAt: now,
    updatedAt: now,
    fsrs: createInitialFsrsCard(new Date()),
  };

  const next = {...db, cards: [...db.cards, card]};
  await saveDatabase(next);
  return next;
};

export const importCards = async (
  db: FlashcardDatabase,
  rows: ImportCardInput[],
  fallbackDeckName: string,
): Promise<{db: FlashcardDatabase; summary: ImportSummary}> => {
  let decks = [...db.decks];
  let cards = [...db.cards];
  let createdDecks = 0;
  let addedCards = 0;
  let updatedCards = 0;
  let skippedCards = 0;

  for (const row of rows) {
    const question = row.question.trim();
    const answer = row.answer.trim();
    const deckName = (row.deckName || fallbackDeckName || 'Imported').trim();

    if (!question || !answer) {
      skippedCards += 1;
      continue;
    }

    const deckResult = findOrCreateDeck(decks, deckName);
    decks = deckResult.decks;
    if (deckResult.created) {
      createdDecks += 1;
    }

    const externalId =
      row.externalId?.trim() || fingerprintCard(deckName, question, answer);
    const existingIndex = cards.findIndex(
      card =>
        card.deckId === deckResult.deckId &&
        (card.externalId === externalId ||
          (!card.externalId &&
            fingerprintCard(deckName, card.question, card.answer) === externalId)),
    );

    if (existingIndex >= 0) {
      const existing = cards[existingIndex];
      const changed =
        existing.question !== question ||
        existing.answer !== answer ||
        existing.externalUpdatedAt !== row.externalUpdatedAt;

      if (!changed) {
        skippedCards += 1;
        continue;
      }

      cards[existingIndex] = {
        ...existing,
        externalId,
        externalUpdatedAt: row.externalUpdatedAt,
        question,
        answer,
        updatedAt: nowIso(),
      };
      updatedCards += 1;
      continue;
    }

    const now = nowIso();
    cards.push({
      id: newId('card'),
      deckId: deckResult.deckId,
      externalId,
      externalUpdatedAt: row.externalUpdatedAt,
      question,
      answer,
      createdAt: now,
      updatedAt: now,
      fsrs: createInitialFsrsCard(new Date()),
    });
    addedCards += 1;
  }

  const next = {...db, decks, cards};
  await saveDatabase(next);
  return {
    db: next,
    summary: {createdDecks, addedCards, updatedCards, skippedCards},
  };
};

export const updateCard = async (
  db: FlashcardDatabase,
  cardId: string,
  input: UpdateCardInput,
): Promise<FlashcardDatabase> => {
  const next = {
    ...db,
    cards: db.cards.map(card =>
      card.id === cardId
        ? {
            ...card,
            deckId: input.deckId,
            question: input.question.trim(),
            answer: input.answer.trim(),
            updatedAt: nowIso(),
          }
        : card,
    ),
  };
  await saveDatabase(next);
  return next;
};

export const deleteCard = async (
  db: FlashcardDatabase,
  cardId: string,
): Promise<FlashcardDatabase> => {
  const next = {
    ...db,
    cards: db.cards.filter(card => card.id !== cardId),
    reviews: db.reviews.filter(review => review.cardId !== cardId),
  };
  await saveDatabase(next);
  return next;
};

export const reviewCard = async (
  db: FlashcardDatabase,
  cardId: string,
  rating: Grade,
): Promise<FlashcardDatabase> => {
  const card = db.cards.find(item => item.id === cardId);
  if (!card) {
    return db;
  }

  const previousState = card.fsrs.state;
  const scheduled = scheduleReview(card.fsrs, rating, new Date());
  const reviewedAt = nowIso();
  const review: ReviewEntry = {
    id: newId('review'),
    cardId,
    deckId: card.deckId,
    reviewedAt,
    rating,
    previousState,
    nextState: scheduled.fsrs.state,
    scheduledDays: scheduled.fsrs.scheduled_days,
  };

  const next = {
    ...db,
    cards: db.cards.map(item =>
      item.id === cardId
        ? {...item, fsrs: scheduled.fsrs, updatedAt: reviewedAt}
        : item,
    ),
    reviews: [...db.reviews, review],
  };
  await saveDatabase(next);
  return next;
};

export const dueCardsForDeck = (
  db: FlashcardDatabase,
  deckId: string,
  now = new Date(),
) =>
  db.cards
    .filter(card => card.deckId === deckId && new Date(card.fsrs.due) <= now)
    .sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));

export const cardsForDeck = (db: FlashcardDatabase, deckId: string) =>
  db.cards
    .filter(card => card.deckId === deckId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const deckStats = (db: FlashcardDatabase, deckId: string) => {
  const cards = db.cards.filter(card => card.deckId === deckId);
  const today = new Date();
  const due = cards.filter(card => new Date(card.fsrs.due) <= today).length;
  const reviews = db.reviews.filter(review => review.deckId === deckId);
  const todayKey = today.toISOString().slice(0, 10);
  const reviewedToday = reviews.filter(review =>
    review.reviewedAt.startsWith(todayKey),
  ).length;

  return {
    total: cards.length,
    due,
    reviewedToday,
    reviews: reviews.length,
  };
};

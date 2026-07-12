import type {Card as FSRSCard, Rating, ReviewLog, State} from 'ts-fsrs';

export type Deck = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CardSideMode = 'text' | 'image';

export type Flashcard = {
  id: string;
  deckId: string;
  externalId?: string;
  externalUpdatedAt?: string;
  question: string;
  answer: string;
  questionMode?: CardSideMode;
  answerMode?: CardSideMode;
  questionImagePath?: string;
  answerImagePath?: string;
  contextImageSide?: 'front' | 'answer';
  contextImagePath?: string;
  hint?: string;
  hintMode?: CardSideMode;
  hintImagePath?: string;
  includeInAnki?: boolean;
  createdAt: string;
  updatedAt: string;
  sourceNotePath?: string;
  sourcePage?: number;
  fsrs: SerializedFSRSCard;
};

export type ReviewEntry = {
  id: string;
  cardId: string;
  deckId: string;
  reviewedAt: string;
  rating: Rating;
  previousState: State;
  nextState: State;
  scheduledDays: number;
};

export type NoteDeckDefault = {
  notePath: string;
  deckId: string;
  updatedAt: string;
};

export type FlashcardSettings = {
  defaultCaptureMode?: CardSideMode;
  imageAttachMode?: 'context' | 'replace';
};

export type FlashcardDatabase = {
  version: 1;
  decks: Deck[];
  cards: Flashcard[];
  reviews: ReviewEntry[];
  noteDefaults: NoteDeckDefault[];
  settings?: FlashcardSettings;
};

export type SerializedFSRSCard = Omit<FSRSCard, 'due' | 'last_review'> & {
  due: string;
  last_review?: string | null;
};

export type AddCardInput = {
  deckId: string;
  question: string;
  answer: string;
  questionMode?: CardSideMode;
  answerMode?: CardSideMode;
  questionImagePath?: string;
  answerImagePath?: string;
  contextImageSide?: 'front' | 'answer';
  contextImagePath?: string;
  hint?: string;
  hintMode?: CardSideMode;
  hintImagePath?: string;
  includeInAnki?: boolean;
  externalId?: string;
  externalUpdatedAt?: string;
  sourceNotePath?: string;
  sourcePage?: number;
};

export type ImportCardInput = {
  deckName?: string;
  question: string;
  answer: string;
  externalId?: string;
  externalUpdatedAt?: string;
};

export type ImportSummary = {
  createdDecks: number;
  addedCards: number;
  updatedCards: number;
  skippedCards: number;
};

export type UpdateCardInput = {
  question: string;
  answer: string;
  deckId: string;
  questionMode?: CardSideMode;
  answerMode?: CardSideMode;
  questionImagePath?: string;
  answerImagePath?: string;
  contextImageSide?: 'front' | 'answer';
  contextImagePath?: string;
  hint?: string;
  hintMode?: CardSideMode;
  hintImagePath?: string;
  includeInAnki?: boolean;
};

export type StudyResult = {
  card: Flashcard;
  log: ReviewLog;
};

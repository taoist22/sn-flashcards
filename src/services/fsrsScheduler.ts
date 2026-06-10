import {
  type Card as FSRSCard,
  createEmptyCard,
  fsrs,
  type Grade,
  Rating,
  State,
} from 'ts-fsrs';
import type {SerializedFSRSCard} from '../types/flashcards';

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
});

export const createInitialFsrsCard = (now = new Date()): SerializedFSRSCard =>
  serializeFsrsCard(createEmptyCard(now));

export const serializeFsrsCard = (card: FSRSCard): SerializedFSRSCard => ({
  ...card,
  due: card.due.toISOString(),
  last_review: card.last_review?.toISOString() ?? null,
});

export const deserializeFsrsCard = (card: SerializedFSRSCard): FSRSCard => ({
  ...card,
  due: new Date(card.due),
  last_review: card.last_review ? new Date(card.last_review) : undefined,
});

export const scheduleReview = (
  card: SerializedFSRSCard,
  rating: Grade,
  now = new Date(),
) => {
  const before = deserializeFsrsCard(card);
  const result = scheduler.next(before, now, rating);

  return {
    fsrs: serializeFsrsCard(result.card),
    log: result.log,
  };
};

export const getRetrievability = (
  card: SerializedFSRSCard,
  now = new Date(),
): number | null => {
  const source = deserializeFsrsCard(card);
  if (source.state === State.New || !source.last_review) {
    return null;
  }

  return scheduler.get_retrievability(source, now, false);
};

export const ratingLabels: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
};

export const stateLabel = (state: State): string => State[state] ?? 'Unknown';

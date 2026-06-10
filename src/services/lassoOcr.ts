import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';

type ApiResponse<T> = {
  success?: boolean;
  result?: T;
  error?: {message?: string};
};

type LassoElement = {
  type?: number;
  maxY?: number;
  recognizeResult?: {
    up_left_point_y?: number;
    down_right_point_y?: number;
  };
  stroke?: unknown;
};

export type OcrFlashcardDraft = {
  question: string;
  answer: string;
  sourceNotePath?: string;
  sourcePage?: number;
};

const unwrap = <T>(response: unknown, fallback: T): T => {
  const typed = response as ApiResponse<T> | null | undefined;
  if (!typed?.success) {
    return fallback;
  }
  return typed.result ?? fallback;
};

const getElementCenterY = (element: LassoElement): number => {
  const recog = element.recognizeResult;
  if (
    typeof recog?.up_left_point_y === 'number' &&
    typeof recog?.down_right_point_y === 'number'
  ) {
    return (recog.up_left_point_y + recog.down_right_point_y) / 2;
  }

  return typeof element.maxY === 'number' ? element.maxY : 0;
};

const splitIntoQuestionAndAnswer = (elements: LassoElement[]) => {
  const sorted = [...elements].sort(
    (a, b) => getElementCenterY(a) - getElementCenterY(b),
  );

  if (sorted.length < 2) {
    return {questionElements: sorted, answerElements: []};
  }

  const centers = sorted.map(getElementCenterY);
  let largestGap = 0;
  let splitIndex = Math.ceil(sorted.length / 2);

  for (let index = 1; index < centers.length; index += 1) {
    const gap = centers[index] - centers[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      splitIndex = index;
    }
  }

  return {
    questionElements: sorted.slice(0, splitIndex),
    answerElements: sorted.slice(splitIndex),
  };
};

const recognize = async (elements: LassoElement[], size: {width: number; height: number}) => {
  if (elements.length === 0) {
    return '';
  }

  const response = await PluginCommAPI.recognizeElements(elements, size);
  return unwrap<string>(response, '').trim();
};

const splitRecognizedText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  return {
    question: lines.slice(0, -1).join('\n'),
    answer: lines.at(-1) ?? '',
  };
};

const clearLassoSelection = async () => {
  try {
    await PluginCommAPI.setLassoBoxState(2);
  } catch {
    // The note app may already have dismissed the lasso box.
  }

  try {
    PluginCommAPI.clearElementCache();
  } catch {
    // Cache cleanup is best-effort and should not block card creation.
  }
};

export const createDraftFromLasso = async (): Promise<OcrFlashcardDraft> => {
  const notePath = unwrap<string | undefined>(
    await PluginCommAPI.getCurrentFilePath(),
    undefined,
  );
  const page = unwrap<number | undefined>(
    await PluginCommAPI.getCurrentPageNum(),
    undefined,
  );
  const size =
    notePath && typeof page === 'number'
      ? unwrap<{width: number; height: number}>(
          await PluginFileAPI.getPageSize(notePath, page),
          {width: 1404, height: 1872},
        )
      : {width: 1404, height: 1872};

  const elements = unwrap<LassoElement[]>(
    await PluginCommAPI.getLassoElements(),
    [],
  ).filter(element => element.type === 0 || element.stroke);

  try {
    const fullText = await recognize(elements, size);
    const splitText = splitRecognizedText(fullText);

    if (splitText) {
      return {
        ...splitText,
        sourceNotePath: notePath,
        sourcePage: page,
      };
    }

    const {questionElements, answerElements} = splitIntoQuestionAndAnswer(elements);
    const [question, answer] = await Promise.all([
      recognize(questionElements, size),
      recognize(answerElements, size),
    ]);

    return {
      question,
      answer,
      sourceNotePath: notePath,
      sourcePage: page,
    };
  } finally {
    await clearLassoSelection();
  }
};

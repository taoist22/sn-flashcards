import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {
  buildSideImagePath,
  clearLassoSelection,
  newDraftImageToken,
  renderElementsToImage,
} from './inkCapture';

type ApiResponse<T> = {
  success?: boolean;
  result?: T;
  error?: {message?: string};
};

export type LassoElement = {
  type?: number;
  maxX?: number;
  maxY?: number;
  recognizeResult?: {
    up_left_point_x?: number;
    up_left_point_y?: number;
    down_right_point_x?: number;
    down_right_point_y?: number;
  };
  stroke?: unknown;
};

export type OcrFlashcardDraft = {
  question: string;
  answer: string;
  sourceNotePath?: string;
  sourcePage?: number;
  questionImagePath?: string;
  answerImagePath?: string;
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

export const splitIntoQuestionAndAnswer = (elements: LassoElement[]) => {
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

export const recognize = async (elements: LassoElement[], size: {width: number; height: number}) => {
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

export const createDraftFromLasso = async (
  options?: {skipOcr?: boolean},
): Promise<OcrFlashcardDraft> => {
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
    const {questionElements, answerElements} = splitIntoQuestionAndAnswer(elements);

    // skipOcr covers non-text ink (foreign scripts, formulas, diagrams) where
    // recognition would only prefill garbage; the geometric split above needs
    // no OCR since element bounds come from the lasso data itself.
    const {question, answer} = options?.skipOcr
      ? {question: '', answer: ''}
      : await (async () => {
          const fullText = await recognize(elements, size);
          const splitText = splitRecognizedText(fullText);
          if (splitText) {
            return splitText;
          }
          const [questionText, answerText] = await Promise.all([
            recognize(questionElements, size),
            recognize(answerElements, size),
          ]);
          return {question: questionText, answer: answerText};
        })();

    // Best-effort: cropping images re-scopes the live lasso box, so it runs
    // last, after the text (already fetched into plain JS element data) is
    // safely captured. A failure here should never break text-only capture.
    let questionImagePath: string | undefined;
    let answerImagePath: string | undefined;
    try {
      const token = newDraftImageToken();
      if (questionElements.length > 0) {
        const path = await buildSideImagePath(token, 'question');
        questionImagePath = (await renderElementsToImage(questionElements, path))
          ? path
          : undefined;
      }
      if (answerElements.length > 0) {
        const path = await buildSideImagePath(token, 'answer');
        answerImagePath = (await renderElementsToImage(answerElements, path))
          ? path
          : undefined;
      }
    } catch {
      // Image capture is optional; the text draft above already succeeded.
    }

    return {
      question,
      answer,
      sourceNotePath: notePath,
      sourcePage: page,
      questionImagePath,
      answerImagePath,
    };
  } finally {
    await clearLassoSelection();
  }
};

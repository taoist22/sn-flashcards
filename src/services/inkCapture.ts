import {FileUtils, PluginCommAPI, RattaFileSelector} from 'sn-plugin-lib';
import type {LassoElement} from './lassoOcr';

// Small margin around a tight ink bounding box so strokes aren't cropped flush
// against the image edge.
const CROP_PADDING = 20;

type Rect = {left: number; top: number; right: number; bottom: number};

const newImageToken = () =>
  `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const getCardImagesDir = async (): Promise<string> => {
  const exportPath = await FileUtils.getExportPath();
  const dir = `${exportPath}/sn-flashcards/card-images`;
  await FileUtils.makeDir(dir);
  return dir;
};

export const buildSideImagePath = async (
  token: string,
  side: 'question' | 'answer' | 'context' | 'hint' | 'capture',
): Promise<string> => {
  const dir = await getCardImagesDir();
  return `${dir}/${token}-${side}.png`;
};

export const newDraftImageToken = newImageToken;

const rectOfElement = (element: LassoElement): Rect | null => {
  const recog = element.recognizeResult;
  if (
    typeof recog?.up_left_point_x === 'number' &&
    typeof recog?.up_left_point_y === 'number' &&
    typeof recog?.down_right_point_x === 'number' &&
    typeof recog?.down_right_point_y === 'number'
  ) {
    return {
      left: recog.up_left_point_x,
      top: recog.up_left_point_y,
      right: recog.down_right_point_x,
      bottom: recog.down_right_point_y,
    };
  }
  return null;
};

export const boundingRectOf = (elements: LassoElement[]): Rect | null => {
  const rects = elements.map(rectOfElement).filter((rect): rect is Rect => rect !== null);
  if (rects.length === 0) {
    return null;
  }

  return {
    left: Math.min(...rects.map(rect => rect.left)) - CROP_PADDING,
    top: Math.min(...rects.map(rect => rect.top)) - CROP_PADDING,
    right: Math.max(...rects.map(rect => rect.right)) + CROP_PADDING,
    bottom: Math.max(...rects.map(rect => rect.bottom)) + CROP_PADDING,
  };
};

// Renders a group of already-lassoed elements to a cropped PNG. Re-scopes the
// live lasso box to the elements' bounding rect, which is why this must run
// before the caller tears down the original lasso selection.
export const renderElementsToImage = async (
  elements: LassoElement[],
  destPath: string,
): Promise<boolean> => {
  const rect = boundingRectOf(elements);
  if (!rect) {
    return false;
  }

  try {
    await PluginCommAPI.lassoElements(rect);
    const response = (await PluginCommAPI.generateLassoPreview(destPath)) as
      | {success?: boolean}
      | null
      | undefined;
    return Boolean(response?.success);
  } catch {
    return false;
  }
};

export const clearLassoSelection = async (): Promise<void> => {
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

// For the "Use as Flashcard Image" button: captures whatever is currently
// lassoed as-is, ink or an inserted picture, with no element filtering or
// bounding-rect math. Unlike renderElementsToImage (used for the front/answer
// split), this doesn't need to know what's inside the box.
export const captureCurrentLassoAsImage = async (destPath: string): Promise<boolean> => {
  try {
    const response = (await PluginCommAPI.generateLassoPreview(destPath)) as
      | {success?: boolean}
      | null
      | undefined;
    return Boolean(response?.success);
  } catch {
    return false;
  }
};

export const importContextImage = async (): Promise<string | null> => {
  const selected = (await RattaFileSelector.selectFile({
    selectType: 0,
    maxNum: 1,
    suffixList: ['png', 'jpg', 'jpeg', 'webp'],
    title: 'Choose Image',
    rightButtonText: 'Select',
  })) as string[] | null | undefined;

  const sourcePath = selected?.[0];
  if (!sourcePath) {
    return null;
  }

  const extension = sourcePath.split('.').pop()?.toLowerCase() || 'png';
  const destPath = await buildSideImagePath(newImageToken(), 'context').then(path =>
    path.replace(/\.png$/, `.${extension}`),
  );

  const copied = await FileUtils.copyFile(sourcePath, destPath);
  return copied ? destPath : null;
};

export const deleteCardImage = async (path?: string): Promise<void> => {
  if (!path) {
    return;
  }
  try {
    await FileUtils.deleteFile(path);
  } catch {
    // Best-effort cleanup only; a leftover file is not worth surfacing an error for.
  }
};

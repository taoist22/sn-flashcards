/**
 * Handwritten guesses via the firmware pen engine.
 *
 * This talks to undocumented vendor internals, so every call fails soft and the UI must
 * treat handwriting as optional: [isInkAvailable] gates whether the surface is offered at
 * all, and if a firmware update breaks any of it the Guess field quietly stays a
 * TextInput. See references/firmware-pen-engine-einkpwinterface.md.
 *
 * Nothing is persisted — the guess lives in the engine's buffer until the card is rated.
 */
import {NativeModules} from 'react-native';

type InkSurfaceNative = {
  isAvailable(): Promise<boolean>;
  activate(penType: number, penWidth: number, penColor: number): Promise<string>;
  freeze(): Promise<string>;
  clear(): Promise<string>;
  hasInk(): Promise<boolean>;
  deactivate(): Promise<string>;
};

const native: InkSurfaceNative | undefined = NativeModules.InkSurface;

/** EinkPWInterface PENTYPE_* — the ones that render as a writing pen. */
export const INK_PEN_TYPES: ReadonlyArray<{id: number; label: string}> = [
  {id: 2, label: 'Pen'},
  {id: 3, label: 'Pen 2'},
  {id: 1, label: 'Pencil'},
  {id: 7, label: 'Ballpoint'},
  {id: 4, label: 'Brush'},
  {id: 12, label: 'Calligraphy'},
];

/**
 * The engine's own default is 4.4, which draws about 4px on an 1875px panel — too thin.
 * 10 reads as a normal pen; 16 is heavy.
 */
export const INK_PEN_WIDTHS: ReadonlyArray<number> = [4.4, 8, 10, 13, 16];

/** PENCOLOR_* — the greys the panel can actually render. */
export const INK_PEN_COLORS: ReadonlyArray<{label: string; value: number}> = [
  {label: 'Black', value: -16777216},
  {label: 'Dark grey', value: -12566464},
  {label: 'Grey', value: -8355712},
];

export const INK_DEFAULT_PEN_TYPE = 2;
export const INK_DEFAULT_PEN_WIDTH = 10;
export const INK_DEFAULT_PEN_COLOR = -16777216;

/**
 * Whether this device can do handwriting at all.
 *
 * Resolution only — nothing is constructed — so it is cheap enough to call whenever the
 * study screen opens. False on any firmware that has moved the engine.
 */
export const isInkAvailable = async (): Promise<boolean> => {
  if (!native) {
    return false;
  }
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
};

/**
 * Start accepting pen input on the mounted surface.
 *
 * Returns 'not-laid-out' when the view has not been measured yet — the engine sizes its
 * writing bitmap from the host's measured dimensions, so the caller retries on the next
 * frame rather than binding to a 0x0 buffer.
 */
export const activateInk = async (
  penType: number,
  penWidth: number,
  penColor: number,
): Promise<string> => {
  if (!native) {
    return 'unavailable';
  }
  try {
    return await native.activate(penType, penWidth, penColor);
  } catch {
    return 'error';
  }
};

/** Stop accepting input but leave the ink on screen, for the comparison view. */
export const freezeInk = async (): Promise<void> => {
  try {
    await native?.freeze();
  } catch {
    // Freezing is a nicety; failing to freeze must not break the review flow.
  }
};

/** Wipe the surface. Called on rating, so the next card starts clean. */
export const clearInk = async (): Promise<void> => {
  try {
    await native?.clear();
  } catch {}
};

export const hasInk = async (): Promise<boolean> => {
  try {
    return (await native?.hasInk()) ?? false;
  } catch {
    return false;
  }
};

/** Release the engine. MUST run on every path that leaves the study screen. */
export const deactivateInk = async (): Promise<void> => {
  try {
    await native?.deactivate();
  } catch {}
};

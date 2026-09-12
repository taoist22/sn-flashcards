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

/**
 * One pen, fixed.
 *
 * Measured on-device: the PENTYPE_* values are visually indistinguishable on this panel,
 * so a picker for them was a control that did nothing. BALLPEN is pressure-uniform by
 * nature, which suits a short legible guess better than an expressive stroke.
 */
export const INK_PEN_TYPE = 7;

/**
 * Black, fixed.
 *
 * The other PENCOLOR_* greys do not render for a stroke pen — most likely because the fast
 * e-ink waveform used for live ink is effectively 1-bit, so mid-greys collapse to black.
 * (MARK escapes this only because it stamps pre-rendered bitmaps carrying their own shade.)
 */
export const INK_PEN_COLOR = -16777216;

/**
 * Widths, labelled rather than raw.
 *
 * The engine's own default of 4.4 draws about 4px on an 1875px panel and is too thin to
 * write with; 10 reads as a normal pen and 16 is heavy. A bare "10" on a chip means
 * nothing to a user, so the values are named.
 */
export const INK_PEN_WIDTHS: ReadonlyArray<{label: string; value: number}> = [
  {label: 'Fine', value: 6},
  {label: 'Thin', value: 8},
  {label: 'Medium', value: 10},
  {label: 'Thick', value: 12},
  {label: 'Bold', value: 14},
];

export const INK_DEFAULT_PEN_WIDTH = 10;

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
export const activateInk = async (penWidth: number): Promise<string> => {
  if (!native) {
    return 'unavailable';
  }
  try {
    return await native.activate(INK_PEN_TYPE, penWidth, INK_PEN_COLOR);
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

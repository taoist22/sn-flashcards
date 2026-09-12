import {requireNativeComponent, ViewStyle} from 'react-native';

/**
 * The pen engine's host view.
 *
 * Must be rendered from JSX so React Native lays it out — the engine sizes its writing
 * bitmap from the host's MEASURED dimensions, and a view attached in native code is never
 * measured. Give it a FIXED height, and never let anything above it change height while
 * the engine is live: a host that moves or resizes makes ink jump and reallocates the
 * bitmap mid-stroke.
 */
export const InkSurfaceView = requireNativeComponent<{style?: ViewStyle}>('InkSurface');

import { Colors } from './colors';

// docs/DesignSystem.pdf 03 (影 / Elevation). offsetY/blurRadius are px,
// opacity is 0-1. Platform-neutral shape; components map this to
// iOS shadow*/Android elevation/CSS box-shadow as needed.
export const Shadow = {
  card: { offsetY: 2, blurRadius: 8, opacity: 0.06, color: Colors.textPrimary },
  button: { offsetY: 4, blurRadius: 12, opacity: 0.28, color: Colors.primary },
  sheet: { offsetY: -8, blurRadius: 30, opacity: 0.16, color: Colors.textPrimary },
} as const;

export type ShadowToken = keyof typeof Shadow;

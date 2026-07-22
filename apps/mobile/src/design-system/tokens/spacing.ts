// docs/DesignSystem.pdf 03 (余白スケール, 4pxグリッド).
// 基準4px。画面端20-22px、カード内14-16px、要素間8-12px。
export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
} as const;

export type SpacingToken = keyof typeof Spacing;

// docs/DesignSystem.pdf 03 (角丸). card is the 18-20px range's upper bound.
export const Radius = {
  small: 8,
  input: 14,
  card: 20,
  sheet: 26,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof Radius;

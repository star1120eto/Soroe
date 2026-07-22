import { Colors } from './colors';

// docs/DesignSystem.pdf 03 (枠線).
export const Border = {
  default: { width: 1, color: Colors.border }, // 通常のカード・区切り
  input: { width: 1.5, color: '#DCCFB8' }, // 入力欄
  selected: { width: 2, color: Colors.primary }, // 選択中・強調
} as const;

export type BorderToken = keyof typeof Border;

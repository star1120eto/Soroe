// docs/DesignSystem.pdf 01 (カラー). Light mode is the MVP spec; values are
// kept as semantic tokens so a future dark mode only needs a second palette.
export const Colors = {
  primary: '#4F7A67', // ブランド／主要ボタン
  primaryStrong: '#365C4B', // 押下・強調文字
  primarySoft: '#E7F0EB', // 選択背景・アイコン地
  accent: '#D9825B', // アクセント・バッジ
  accentSoft: '#F7E8DE', // アクセント地
  background: '#FBF8F2', // 画面背景（クリーム）
  surface: '#FFFDF9', // カード・入力欄
  surfaceAlt: '#F0EADD', // アイコン丸・ピル地
  textPrimary: '#26332D', // 見出し・本文
  textSecondary: '#6F7B74', // 補足・ラベル
  border: '#EBE4D7', // 枠線・区切り
  success: '#3F8A61', // 同期済み・成功
  warning: '#C9A24B', // 保留・注意
  danger: '#C9503A', // 削除・エラー
  dangerSoft: '#FBECE6', // 破壊的操作の地
} as const;

export type ColorToken = keyof typeof Colors;

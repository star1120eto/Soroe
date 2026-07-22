import type { TextStyle } from 'react-native';

import { FontFamily } from './fonts';

// docs/DesignSystem.pdf 02 (タイポグラフィ). lineHeight is fontSize * 行間, rounded.
export const Typography = {
  display: {
    fontFamily: FontFamily.zenMaruBold,
    fontSize: 27,
    lineHeight: 32,
  },
  title: {
    fontFamily: FontFamily.zenMaruBold,
    fontSize: 24,
    lineHeight: 31,
  },
  heading: {
    fontFamily: FontFamily.zenMaruBold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: FontFamily.notoSansMedium,
    fontSize: 15,
    lineHeight: 24,
  },
  label: {
    fontFamily: FontFamily.zenMaruBold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: FontFamily.notoSansMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  micro: {
    fontFamily: FontFamily.notoSansBold,
    fontSize: 11,
    lineHeight: 15,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof Typography;

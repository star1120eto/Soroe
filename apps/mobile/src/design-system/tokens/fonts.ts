import {
  useFonts,
  ZenMaruGothic_500Medium,
  ZenMaruGothic_700Bold,
} from '@expo-google-fonts/zen-maru-gothic';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_600SemiBold,
  NotoSansJP_700Bold,
} from '@expo-google-fonts/noto-sans-jp';

// docs/DesignSystem.pdf 02 (タイポグラフィ).
// Zen Maru Gothic: 画面タイトル・カード名・ボタン (weight 500/700)
// Noto Sans JP: 本文・ラベル・補足 (weight 400/500/600/700)
export const FontFamily = {
  zenMaruMedium: 'ZenMaruGothic_500Medium',
  zenMaruBold: 'ZenMaruGothic_700Bold',
  notoSansRegular: 'NotoSansJP_400Regular',
  notoSansMedium: 'NotoSansJP_500Medium',
  notoSansSemiBold: 'NotoSansJP_600SemiBold',
  notoSansBold: 'NotoSansJP_700Bold',
} as const;

export function useAppFonts() {
  return useFonts({
    ZenMaruGothic_500Medium,
    ZenMaruGothic_700Bold,
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_600SemiBold,
    NotoSansJP_700Bold,
  });
}

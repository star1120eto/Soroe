import { StyleSheet, Text, View } from 'react-native';

import { Icon, type PhIconName } from '../icons/Icon';
import { Colors, Radius, Spacing, Typography } from '../tokens';

// Not detailed in docs/DesignSystem.pdf; composed from the existing 01 color
// tokens only (no new palette entries) to stay consistent with the system.
export type BannerVariant = 'info' | 'warning' | 'danger';

type BannerProps = {
  message: string;
  variant?: BannerVariant;
};

const VARIANT_STYLE: Record<BannerVariant, { icon: PhIconName; color: string; background: string }> = {
  info: { icon: 'bell', color: Colors.primaryStrong, background: Colors.primarySoft },
  warning: { icon: 'warning', color: Colors.warning, background: Colors.accentSoft },
  danger: { icon: 'warning', color: Colors.danger, background: Colors.dangerSoft },
};

export function Banner({ message, variant = 'info' }: BannerProps) {
  const style = VARIANT_STYLE[variant];

  return (
    <View style={[styles.banner, { backgroundColor: style.background }]}>
      <Icon name={style.icon} color={style.color} size={20} />
      <Text style={[Typography.body, styles.message, { color: style.color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.card,
  },
  message: {
    flex: 1,
  },
});

import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from '../icons/Icon';
import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Chip).
export type ChipVariant = 'default' | 'selected' | 'multiSelect';

type ChipProps = {
  label: string;
  variant?: ChipVariant;
  onPress?: () => void;
};

const VARIANT_STYLE: Record<ChipVariant, { background: string; textColor: string; borderWidth: number; borderColor: string }> = {
  default: {
    background: Colors.surface,
    textColor: Colors.textPrimary,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
  },
  selected: {
    background: Colors.primary,
    textColor: Colors.surface,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  multiSelect: {
    background: Colors.primarySoft,
    textColor: Colors.primaryStrong,
    borderWidth: 0,
    borderColor: 'transparent',
  },
};

export function Chip({ label, variant = 'default', onPress }: ChipProps) {
  const style = VARIANT_STYLE[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: variant !== 'default' }}
      onPress={onPress}
      hitSlop={Spacing[2]}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: style.background,
          borderWidth: style.borderWidth,
          borderColor: style.borderColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {variant === 'multiSelect' ? <Icon name="check" color={style.textColor} size={14} /> : null}
      <Text style={[Typography.label, { color: style.textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    minHeight: 44,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing[4],
  },
});

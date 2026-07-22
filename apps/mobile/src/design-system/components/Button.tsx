import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Button). 高さ最低48px、角丸999px。
export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive';

type ButtonProps = {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
};

const VARIANT_STYLE: Record<
  ButtonVariant,
  { background: string; pressedBackground: string; textColor: string; borderWidth: number; borderColor: string }
> = {
  primary: {
    background: Colors.primary,
    pressedBackground: Colors.primaryStrong,
    textColor: Colors.surface,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  secondary: {
    background: Colors.surface,
    pressedBackground: Colors.background,
    textColor: Colors.textPrimary,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
  },
  text: {
    background: 'transparent',
    pressedBackground: 'transparent',
    textColor: Colors.textSecondary,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  destructive: {
    background: Colors.danger,
    pressedBackground: Colors.danger,
    textColor: Colors.surface,
    borderWidth: 0,
    borderColor: 'transparent',
  },
};

export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const style = VARIANT_STYLE[variant];
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !isInteractive }}
      disabled={!isInteractive}
      onPress={onPress}
      hitSlop={Spacing[2]}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && isInteractive ? style.pressedBackground : style.background,
          borderWidth: style.borderWidth,
          borderColor: style.borderColor,
          opacity: variant === 'text' && pressed ? 0.6 : !disabled || loading ? 1 : 0.4,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={style.textColor} />
      ) : (
        <Text style={[Typography.label, { color: style.textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    minWidth: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
});

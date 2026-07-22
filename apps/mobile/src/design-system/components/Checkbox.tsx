import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Colors, Spacing } from '../tokens';

// docs/DesignSystem.pdf 04 (List Row・Checkbox).
// 未完了: 円形+#D5CDBB枠 / 完了: #4F7A67塗り+ph:check.
const UNCHECKED_BORDER_COLOR = '#D5CDBB';
const CIRCLE_SIZE = 24;

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Checkbox({ checked, onChange, disabled }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={Spacing[3]}
      style={[
        styles.circle,
        checked
          ? { backgroundColor: Colors.primary, borderWidth: 0 }
          : { borderWidth: 2, borderColor: UNCHECKED_BORDER_COLOR },
        disabled && styles.disabled,
      ]}>
      <View>{checked ? <Icon name="check" color={Colors.surface} size={14} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});

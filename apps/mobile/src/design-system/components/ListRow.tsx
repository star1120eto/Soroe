import { StyleSheet, Text, View } from 'react-native';

import { Checkbox } from './Checkbox';
import { Colors, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (List Row・Checkbox). 行高≥48px.
type ListRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  meta?: string;
};

export function ListRow({ label, checked, onChange, meta }: ListRowProps) {
  return (
    <View style={styles.row}>
      <Checkbox checked={checked} onChange={onChange} />
      <Text
        style={[
          Typography.body,
          styles.label,
          checked && { color: Colors.textSecondary, textDecorationLine: 'line-through' },
        ]}>
        {label}
      </Text>
      {meta ? <Text style={[Typography.caption, styles.meta]}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: Spacing[3],
  },
  label: {
    flex: 1,
    color: Colors.textPrimary,
  },
  meta: {
    color: Colors.textSecondary,
  },
});

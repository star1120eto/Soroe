import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type PhIconName } from '../icons/Icon';
import { Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Bottom Tab).
// 選択中: #4F7A67 + #E7F0EBのピル背景。非選択: #6F7B74.
export type BottomTabItem = {
  key: string;
  icon: PhIconName;
  label: string;
};

type BottomTabProps = {
  items: BottomTabItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

export function BottomTab({ items, selectedKey, onSelect }: BottomTabProps) {
  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const isSelected = item.key === selectedKey;
        const color = isSelected ? Colors.primary : Colors.textSecondary;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item.key)}
            style={styles.item}>
            <View style={[styles.pill, isSelected && { backgroundColor: Colors.primarySoft }]}>
              <Icon name={item.icon} color={color} size={24} />
            </View>
            <Text style={[Typography.micro, { color }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
  },
  pill: {
    minWidth: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.pill,
  },
});

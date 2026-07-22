import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Paywall / Plan Card).
// 誇張・カウントダウン・偽割引は禁止 — no exaggerated claims, countdowns, or fake discounts.
type PlanCardProps = {
  title: string;
  price: string;
  badge?: string;
  selected: boolean;
  onPress?: () => void;
};

export function PlanCard({ title, price, badge, selected, onPress }: PlanCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderWidth: selected ? Border.selected.width : Border.default.width,
          borderColor: selected ? Border.selected.color : Border.default.color,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.textColumn}>
        <View style={styles.titleRow}>
          <Text style={[Typography.heading, styles.title]}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={[Typography.micro, styles.badgeText]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[Typography.body, styles.price]}>{price}</Text>
      </View>
      <View style={[styles.indicator, selected && { backgroundColor: Colors.primary }]}>
        {selected ? <Icon name="check" color={Colors.surface} size={14} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    padding: Spacing[4],
    borderRadius: Radius.card,
    backgroundColor: Colors.surface,
  },
  textColumn: {
    gap: Spacing[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  title: {
    color: Colors.textPrimary,
  },
  price: {
    color: Colors.textSecondary,
  },
  badge: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  badgeText: {
    color: Colors.surface,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: '#D5CDBB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

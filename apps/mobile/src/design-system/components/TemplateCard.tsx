import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type PhIconName } from '../icons/Icon';
import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Template Card).
type TemplateCardProps = {
  icon: PhIconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
  // LIST-002: リストの色選択を反映する場合に渡す。未指定時は従来通り
  // primarySoft/primaryStrongの組み合わせを使う。
  accentColor?: string;
};

export function TemplateCard({ icon, title, subtitle, onPress, accentColor }: TemplateCardProps) {
  const iconCircleBackground = accentColor ?? Colors.primarySoft;
  const iconColor = accentColor ? Colors.surface : Colors.primaryStrong;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.iconCircle, { backgroundColor: iconCircleBackground }]}>
        <Icon name={icon} color={iconColor} size={24} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[Typography.heading, styles.title]}>{title}</Text>
        <Text style={[Typography.caption, styles.subtitle]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
    padding: Spacing[4],
    borderRadius: Radius.card,
    backgroundColor: Colors.surface,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
  },
  subtitle: {
    color: Colors.textSecondary,
  },
});

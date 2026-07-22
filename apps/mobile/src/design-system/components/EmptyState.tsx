import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Colors, Spacing, Typography } from '../tokens';
import { Button } from './Button';

// docs/DesignSystem.pdf 05: ph:tray is designated for 空状態 (empty state).
type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Icon name="tray" color={Colors.textSecondary} size={40} />
      <Text style={[Typography.heading, styles.title]}>{title}</Text>
      {description ? <Text style={[Typography.body, styles.description]}>{description}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[6],
  },
  title: {
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

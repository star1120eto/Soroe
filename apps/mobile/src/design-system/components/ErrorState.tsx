import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Colors, Spacing, Typography } from '../tokens';
import { Button } from './Button';

// Not detailed in docs/DesignSystem.pdf; mirrors EmptyState using ph:warning.
type ErrorStateProps = {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, description, retryLabel, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Icon name="warning" color={Colors.danger} size={40} />
      <Text style={[Typography.heading, styles.title]}>{title}</Text>
      {description ? <Text style={[Typography.body, styles.description]}>{description}</Text> : null}
      {retryLabel && onRetry ? <Button label={retryLabel} onPress={onRetry} variant="primary" /> : null}
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

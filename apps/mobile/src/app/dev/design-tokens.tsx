import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Border,
  Colors,
  Icon,
  Radius,
  Spacing,
  Typography,
  useAppFonts,
  type PhIconName,
} from '@/design-system';
import { phIconPaths } from '@/design-system/icons/ph-icon-paths';

export default function DesignTokensScreen() {
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.display, styles.textColor]}>Design Tokens</Text>

        <Text style={[Typography.title, styles.textColor]}>Colors</Text>
        <View style={styles.colorGrid}>
          {Object.entries(Colors).map(([name, hex]) => (
            <View key={name} style={styles.colorCard}>
              <View style={[styles.colorSwatch, { backgroundColor: hex }]} />
              <Text style={[Typography.label, styles.textColor]}>{name}</Text>
              <Text style={[Typography.caption, styles.textSecondary]}>{hex}</Text>
            </View>
          ))}
        </View>

        <Text style={[Typography.title, styles.textColor]}>Typography</Text>
        {Object.entries(Typography).map(([name, style]) => (
          <Text key={name} style={[style, styles.textColor]}>
            {name} — {style.fontSize}px
          </Text>
        ))}

        <Text style={[Typography.title, styles.textColor]}>Spacing</Text>
        <View style={styles.row}>
          {Object.entries(Spacing).map(([step, px]) => (
            <View key={step} style={styles.spacingItem}>
              <View style={[styles.spacingBar, { width: px, height: px }]} />
              <Text style={[Typography.caption, styles.textSecondary]}>{px}px</Text>
            </View>
          ))}
        </View>

        <Text style={[Typography.title, styles.textColor]}>Radius</Text>
        <View style={styles.row}>
          {Object.entries(Radius).map(([name, value]) => (
            <View key={name} style={styles.radiusItem}>
              <View style={[styles.radiusBox, { borderRadius: Math.min(value, 32) }]} />
              <Text style={[Typography.caption, styles.textSecondary]}>{name}</Text>
            </View>
          ))}
        </View>

        <Text style={[Typography.title, styles.textColor]}>Border</Text>
        <View style={styles.row}>
          {Object.entries(Border).map(([name, spec]) => (
            <View
              key={name}
              style={[
                styles.borderBox,
                { borderWidth: spec.width, borderColor: spec.color },
              ]}
            >
              <Text style={[Typography.caption, styles.textSecondary]}>{name}</Text>
            </View>
          ))}
        </View>

        <Text style={[Typography.title, styles.textColor]}>Icons (ph:*)</Text>
        <View style={styles.iconGrid}>
          {(Object.keys(phIconPaths) as PhIconName[]).map((name) => (
            <View key={name} style={styles.iconItem}>
              <Icon name={name} color={Colors.primary} size={24} />
              <Text style={[Typography.micro, styles.textSecondary]}>{name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[4],
  },
  textColor: {
    color: Colors.textPrimary,
  },
  textSecondary: {
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
    alignItems: 'flex-end',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  colorCard: {
    width: 120,
  },
  colorSwatch: {
    height: 48,
    borderRadius: Radius.small,
    marginBottom: Spacing[1],
  },
  spacingItem: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  spacingBar: {
    backgroundColor: Colors.primary,
  },
  radiusItem: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  radiusBox: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primarySoft,
  },
  borderBox: {
    width: 100,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
  },
  iconItem: {
    alignItems: 'center',
    width: 72,
    gap: Spacing[1],
  },
});

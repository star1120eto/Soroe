import { randomUUID } from 'expo-crypto';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_PARTY_SIZE, scaleQuantity, type MyTemplate, type OfficialTemplate, type OfficialTemplateItem } from '@soroe/shared';

import { Banner, Button, Checkbox, Chip, Colors, ErrorState, Skeleton, Spacing, Typography } from '@/design-system';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';
import { useSession } from '@/features/session/SessionProvider';
import {
  createListFromTemplate,
  subscribeToMyTemplate,
  subscribeToOfficialTemplateItems,
  subscribeToOfficialTemplates,
} from '@/features/templates/TemplateRepository';
import { MyTemplateManager } from '@/features/templates/MyTemplateManager';
import { describeTemplateError } from '@/features/templates/templateErrors';
import { initialSelection, toggleSelection } from '@/features/templates/templateSelection';
import { localizeItem, localizeTemplate } from '@/features/templates/templateText';

type ViewItem = { id: string; name: string; quantity: number | null; unit: string | null; perPerson: boolean };
type TemplateView = {
  title: string;
  description: string | null;
  notice: string | null;
  adjustable: boolean;
  defaultPartySize: number;
  items: ViewItem[];
};

function formatQuantity(quantity: number | null, unit: string | null): string {
  return quantity === null ? '' : `${quantity}${unit ?? ''}`;
}

// TMPL-02 / MYTM-01: テンプレートの詳細。名称・説明・注意事項・項目を表示し、不要な項目を外して
// 通常のリストとして作成する(公式・マイ共通)。作成はCloud Functionsで上限を判定する(オンライン必須)。
export default function TemplateDetailScreen() {
  const router = useRouter();
  const { source, templateId } = useLocalSearchParams<{ source: 'official' | 'my'; templateId: string }>();
  const { profile } = useSession();
  const { isOffline } = useConnectivity();

  const [officialTemplate, setOfficialTemplate] = useState<OfficialTemplate | null | undefined>(undefined);
  const [officialItems, setOfficialItems] = useState<OfficialTemplateItem[] | undefined>(undefined);
  const [myTemplate, setMyTemplate] = useState<MyTemplate | null | undefined>(undefined);
  const [selection, setSelection] = useState<Set<string> | null>(null); // null = 全項目を選択
  const [partySizeOverride, setPartySizeOverride] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => randomUUID());

  const uid = profile?.uid ?? null;

  useEffect(() => {
    if (!templateId || !uid) {
      return;
    }
    const onError = () => setLoadFailed(true);
    if (source === 'my') {
      return subscribeToMyTemplate(uid, templateId, setMyTemplate, onError);
    }
    const unsubscribeTemplates = subscribeToOfficialTemplates(
      (templates) => setOfficialTemplate(templates.find((template) => template.id === templateId) ?? null),
      onError
    );
    const unsubscribeItems = subscribeToOfficialTemplateItems(templateId, setOfficialItems, onError);
    return () => {
      unsubscribeTemplates();
      unsubscribeItems();
    };
  }, [source, templateId, uid]);

  const language = profile?.language ?? 'ja';

  const view = useMemo<TemplateView | null | undefined>(() => {
    if (source === 'my') {
      if (myTemplate === undefined || myTemplate === null) {
        return myTemplate;
      }
      return {
        title: myTemplate.title,
        description: myTemplate.description,
        notice: null,
        adjustable: false,
        defaultPartySize: 1,
        items: myTemplate.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          perPerson: false,
        })),
      };
    }
    if (officialTemplate === undefined || officialItems === undefined) {
      return undefined;
    }
    if (officialTemplate === null) {
      return null;
    }
    const text = localizeTemplate(officialTemplate, language);
    return {
      title: text.title,
      description: text.description,
      notice: officialTemplate.hasSafetyNotice ? text.notice : null,
      adjustable: officialTemplate.adjustableByPeople,
      defaultPartySize: officialTemplate.defaultPartySize,
      items: officialItems.map((item) => {
        const itemText = localizeItem(item, language);
        return { id: item.id, name: itemText.name, quantity: item.quantity, unit: itemText.unit, perPerson: item.perPerson };
      }),
    };
  }, [source, myTemplate, officialTemplate, officialItems, language]);

  if (!profile) {
    return <Redirect href="/" />;
  }

  if (loadFailed || view === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="テンプレートが見つかりません" description="削除されたか、読み込めませんでした" />
      </SafeAreaView>
    );
  }
  if (view === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }

  const allIds = view.items.map((item) => item.id);
  const selected = selection ?? initialSelection(allIds);
  const partySize = partySizeOverride ?? view.defaultPartySize;
  const createBlocked = isOffline || busy || selected.size === 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createListFromTemplate({
        source,
        templateId,
        itemIds: allIds.filter((id) => selected.has(id)),
        partySize: view.adjustable ? partySize : undefined,
        language,
        requestId,
      });
      router.replace(`/list/${result.listId}`);
    } catch (e) {
      setError(describeTemplateError(e, 'create'));
    } finally {
      setBusy(false);
    }
  };

  // 登山・防災など安全に関わるものは、作成の前に注意事項を確認してもらう。
  const onCreatePress = () => {
    if (view.notice) {
      Alert.alert('ご確認ください', view.notice, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '確認して作成', onPress: () => void create() },
      ]);
      return;
    }
    void create();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Banner message={error} variant="danger" /> : null}
        {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}

        <Text style={[Typography.title, styles.title]}>{view.title}</Text>
        {view.description ? <Text style={[Typography.body, styles.secondary]}>{view.description}</Text> : null}
        {view.notice ? <Banner message={view.notice} variant="warning" /> : null}

        {view.adjustable ? (
          <View style={styles.group}>
            <Text style={[Typography.label, styles.secondary]}>人数</Text>
            <View style={styles.wrap}>
              {Array.from({ length: MAX_PARTY_SIZE }, (_, index) => index + 1).map((size) => (
                <Chip
                  key={size}
                  label={`${size}人`}
                  variant={partySize === size ? 'selected' : 'default'}
                  onPress={() => setPartySizeOverride(size)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={[Typography.label, styles.secondary]}>
            項目({selected.size}/{allIds.length})
          </Text>
          {view.items.map((item) => {
            const checked = selected.has(item.id);
            const meta = formatQuantity(
              view.adjustable ? scaleQuantity({ quantity: item.quantity, perPerson: item.perPerson }, partySize) : item.quantity,
              item.unit
            );
            const toggle = () => setSelection(toggleSelection(selected, item.id));
            return (
              <Pressable
                key={item.id}
                onPress={toggle}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={item.name}
                style={styles.itemRow}>
                {/* 行全体がチェックボックスのため、中のCheckboxは支援技術から隠す(二重に読み上げない)。 */}
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Checkbox checked={checked} onChange={toggle} />
                </View>
                <Text style={[Typography.body, styles.itemName, !checked && styles.itemOff]}>{item.name}</Text>
                {meta ? <Text style={[Typography.caption, styles.secondary]}>{meta}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Button label="リストを作成" onPress={onCreatePress} loading={busy} disabled={createBlocked} variant="primary" />

        {source === 'my' && myTemplate ? (
          <MyTemplateManager uid={profile.uid} template={myTemplate} onDeleted={() => router.back()} />
        ) : null}
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
  title: {
    color: Colors.textPrimary,
  },
  secondary: {
    color: Colors.textSecondary,
  },
  group: {
    gap: Spacing[2],
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
  },
  itemName: {
    flex: 1,
    color: Colors.textPrimary,
  },
  itemOff: {
    color: Colors.textSecondary,
  },
});

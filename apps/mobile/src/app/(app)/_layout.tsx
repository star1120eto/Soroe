import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';

import { BottomTab, type BottomTabItem, type PhIconName } from '@/design-system';
import { clearPendingInviteToken, readPendingInviteToken } from '@/features/session/pending-invite';

// docs/DesignSystem.pdf 04 (Bottom Tab): リスト / テンプレート / AI生成 / 設定.
const TAB_ICON: Record<string, PhIconName> = {
  index: 'house',
  templates: 'squares-four',
  ai: 'sparkle',
  settings: 'gear',
};

const TAB_LABEL: Record<string, string> = {
  index: 'リスト',
  templates: 'テンプレート',
  ai: 'AI生成',
  settings: '設定',
};

export default function AppLayout() {
  const router = useRouter();

  useEffect(() => {
    readPendingInviteToken().then((token) => {
      if (token) {
        clearPendingInviteToken();
        router.replace(`/invite/${token}`);
      }
    });
  }, [router]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => {
        const items: BottomTabItem[] = state.routes.map((route) => ({
          key: route.name,
          icon: TAB_ICON[route.name] ?? 'house',
          label: TAB_LABEL[route.name] ?? route.name,
        }));

        return (
          <BottomTab
            items={items}
            selectedKey={state.routes[state.index].name}
            onSelect={(key) => {
              const route = state.routes.find((r) => r.name === key);
              if (!route) {
                return;
              }
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          />
        );
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="templates" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

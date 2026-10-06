import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { List, ListMember } from '@soroe/shared';

import {
  Banner,
  Border,
  Button,
  Colors,
  ErrorState,
  Icon,
  Radius,
  Skeleton,
  Spacing,
  Typography,
} from '@/design-system';
import { subscribeToList, subscribeToListMembers } from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';
import { isAccessDeniedError } from '@/features/sharing/accessErrors';
import { formatInviteExpiry, isInviteActive } from '@/features/sharing/inviteExpiry';
import { buildInviteShareMessage, buildInviteUrl, generateInviteToken } from '@/features/sharing/inviteToken';
import { memberDisplayName, roleLabel, sortMembers } from '@/features/sharing/memberLabels';
import { describeShareActionError } from '@/features/sharing/shareActionErrors';
import {
  createInvite,
  leaveList,
  removeMember,
  revokeInvite,
  subscribeToActiveInvites,
  transferOwnership,
  type ActiveInvite,
} from '@/features/sharing/ShareRepository';

// SHARE-01 / SHARE-03: 家族を招待し、メンバーを管理する。現在のメンバー、招待中(有効期限)、
// 招待リンクの共有はオーナー、退出は編集者。招待・メンバー管理はサーバー検証を伴う
// オンライン必須の操作のため、その旨を表示する。
export default function ListShareScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { profile } = useSession();

  const [list, setList] = useState<List | null | undefined>(undefined);
  const [members, setMembers] = useState<ListMember[] | null>(null);
  const [invites, setInvites] = useState<ActiveInvite[]>([]);
  const [loadError, setLoadError] = useState<'access-denied' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 期限表示用の「現在」。再描画のたびに変わる値を直接使わず、画面表示時点で固定する。
  const [now] = useState(() => Date.now());

  const uid = profile?.uid ?? null;
  const isOwner = list != null && uid !== null && list.ownerId === uid;
  const isArchived = list != null && list.archivedAt !== null;

  useEffect(() => {
    if (!listId) {
      return;
    }
    const onError = (error: Error) => setLoadError(isAccessDeniedError(error) ? 'access-denied' : 'failed');
    const unsubscribeList = subscribeToList(listId, setList, onError);
    const unsubscribeMembers = subscribeToListMembers(listId, setMembers, onError);
    return () => {
      unsubscribeList();
      unsubscribeMembers();
    };
  }, [listId]);

  // 招待はオーナーだけが読める(Rules)。オーナーになったとき(所有権移譲の受け手)に
  // 購読を始め、オーナーでなくなったら止める。
  useEffect(() => {
    if (!listId || !isOwner) {
      return;
    }
    const unsubscribe = subscribeToActiveInvites(listId, setInvites, () => setInvites([]));
    return () => {
      unsubscribe();
      setInvites([]);
    };
  }, [listId, isOwner]);

  const sortedMembers = useMemo(() => sortMembers(members ?? []), [members]);
  const activeInvites = invites.filter((invite) => isInviteActive(invite, now));

  if (!profile) {
    return <Redirect href="/" />;
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(describeShareActionError(error));
    } finally {
      setBusy(false);
    }
  };

  const shareInviteLink = () =>
    run(async () => {
      if (!list) {
        return;
      }
      // トークンは共有のたびに新しく生成する。createInviteの冪等性キーを兼ね、
      // 同じリストの以前の有効な招待はサーバーが同時に取り消す。
      const token = generateInviteToken();
      await createInvite({ listId: list.id, token });
      await Share.share({ message: buildInviteShareMessage(list.name, buildInviteUrl(token)) });
    });

  const confirmRevoke = (invite: ActiveInvite) =>
    Alert.alert('招待リンクを取り消しますか？', '取り消すと、このリンクからは参加できなくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '取り消す',
        style: 'destructive',
        onPress: () => run(async () => void (await revokeInvite(invite.inviteId))),
      },
    ]);

  const confirmRemove = (member: ListMember) => {
    const name = memberDisplayName(member, profile.uid);
    Alert.alert(`${name}を削除しますか？`, 'このメンバーはリストを見られなくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => run(async () => void (await removeMember(list!.id, member.uid))),
      },
    ]);
  };

  const confirmTransfer = (member: ListMember) => {
    const name = memberDisplayName(member, profile.uid);
    Alert.alert(
      `${name}をオーナーにしますか？`,
      'あなたは編集者になり、招待・メンバー削除・アーカイブ・削除ができなくなります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'オーナーを移す',
          onPress: () => run(async () => void (await transferOwnership(list!.id, member.uid))),
        },
      ]
    );
  };

  const openMemberMenu = (member: ListMember) => {
    const name = memberDisplayName(member, profile.uid);
    Alert.alert(name, undefined, [
      { text: 'オーナーにする', onPress: () => confirmTransfer(member) },
      { text: 'メンバーから削除', style: 'destructive', onPress: () => confirmRemove(member) },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const confirmLeave = () =>
    Alert.alert('このリストから退出しますか？', '退出するとリストを見られなくなります。再び参加するには招待が必要です。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '退出する',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await leaveList(list!.id);
            router.dismissTo('/');
          }),
      },
    ]);

  if (loadError === 'access-denied') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          title="アクセスできなくなりました"
          description="このリストのメンバーではなくなりました"
          retryLabel="リスト一覧へ"
          onRetry={() => router.dismissTo('/')}
        />
      </SafeAreaView>
    );
  }
  if (loadError === 'failed') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description="メンバーを読み込めませんでした" />
      </SafeAreaView>
    );
  }
  if (list === undefined || members === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }
  if (list === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="リストが見つかりません" description="削除されたか、閲覧できない可能性があります" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {actionError ? <Banner message={actionError} variant="danger" /> : null}

        <View style={styles.section}>
          <Text style={[Typography.heading, styles.sectionTitle]}>メンバー({sortedMembers.length}人)</Text>
          {sortedMembers.map((member) => (
            <View key={member.uid} style={styles.memberRow}>
              <Icon name="user" color={Colors.textSecondary} size={24} />
              <View style={styles.memberText}>
                <Text style={[Typography.body, styles.memberName]}>{memberDisplayName(member, profile.uid)}</Text>
                <Text style={[Typography.caption, styles.secondary]}>{roleLabel(member.role)}</Text>
              </View>
              {isOwner && member.uid !== profile.uid ? (
                <Button label="管理" onPress={() => openMemberMenu(member)} variant="secondary" disabled={busy} />
              ) : null}
            </View>
          ))}
        </View>

        {isOwner ? (
          <View style={styles.section}>
            <Text style={[Typography.heading, styles.sectionTitle]}>家族を招待</Text>
            {isArchived ? (
              <Banner message="アーカイブ中のリストには招待できません。アクティブに戻してください。" variant="warning" />
            ) : (
              <>
                {activeInvites.map((invite) => (
                  <View key={invite.inviteId} style={styles.inviteRow}>
                    <Icon name="link-simple" color={Colors.primaryStrong} size={24} />
                    <View style={styles.memberText}>
                      <Text style={[Typography.body, styles.memberName]}>招待リンクを発行済み</Text>
                      <Text style={[Typography.caption, styles.secondary]}>
                        {formatInviteExpiry(invite.expiresAt, now)}
                      </Text>
                    </View>
                    <Button label="取消" onPress={() => confirmRevoke(invite)} variant="secondary" disabled={busy} />
                  </View>
                ))}
                <Button
                  label={activeInvites.length > 0 ? 'リンクを再発行して共有' : '招待リンクを共有'}
                  onPress={shareInviteLink}
                  loading={busy}
                />
                <Text style={[Typography.caption, styles.secondary]}>
                  リンクは7日間有効です。再発行すると以前のリンクは使えなくなります。招待にはオンライン接続が必要です。
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Button label="リストから退出" onPress={confirmLeave} variant="destructive" disabled={busy} />
          </View>
        )}

        {isOwner ? (
          <Text style={[Typography.caption, styles.secondary]}>
            オーナーは退出できません。退出するには、先に所有権を移譲するかリストを削除してください。
          </Text>
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
    gap: Spacing[5],
  },
  section: {
    gap: Spacing[3],
  },
  sectionTitle: {
    color: Colors.textPrimary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 56,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.card,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
    backgroundColor: Colors.surface,
  },
  memberText: {
    flex: 1,
  },
  memberName: {
    color: Colors.textPrimary,
  },
  secondary: {
    color: Colors.textSecondary,
  },
});

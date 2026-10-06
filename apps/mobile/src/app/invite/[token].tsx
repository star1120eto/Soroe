import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inviteTokenSchema, type InvitePreviewResponse } from '@soroe/shared';

import { Banner, Border, Button, Colors, ErrorState, Icon, Radius, Skeleton, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';
import { savePendingInviteToken } from '@/features/session/pending-invite';
import { describeInviteProblem, type InviteProblem } from '@/features/sharing/inviteMessages';
import { describeShareActionError } from '@/features/sharing/shareActionErrors';
import { acceptInvite, previewInvite } from '@/features/sharing/ShareRepository';

// SHARE-02: 招待を受け取った。Universal Link/カスタムスキームで開かれ、未認証でも
// プレビュー(リスト名・招待者名・メンバー数。項目内容は出さない)を見せてから
// ログインへ進める。認証済みなら「参加する」で受諾する。受諾の検証(期限・取消・
// 削除・自分の招待・既参加・Free上限)はすべてサーバー(acceptInvite)で行う。
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status } = useSession();
  const router = useRouter();

  // 受諾の冪等性キー。画面を開いている間は同じ値を使い、二重タップでも
  // サーバー側で1回だけの参加になる。
  const [requestId] = useState(() => randomUUID());
  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [acceptProblem, setAcceptProblem] = useState<InviteProblem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isTokenWellFormed = inviteTokenSchema.safeParse(token).success;

  useEffect(() => {
    if (!token || !isTokenWellFormed) {
      return;
    }
    let cancelled = false;
    previewInvite(token).then(
      (result) => {
        if (!cancelled) {
          setPreview(result);
        }
      },
      () => {
        if (!cancelled) {
          setPreviewFailed(true);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [token, isTokenWellFormed, reloadKey]);

  // 未認証でリンクを開いた時点でトークンを保持する。プレビューの取得に失敗しても(オフライン等)
  // ログイン後にこの招待へ戻れるよう、画面操作を待たずに保存する。ログイン後は
  // (app)/_layout.tsxが保存済みトークンからこの画面を再開する。
  useEffect(() => {
    if (status !== 'authenticated' && token && isTokenWellFormed) {
      savePendingInviteToken(token).catch(() => {
        /* 保存できなくても、プレビューとログインへの導線は使える */
      });
    }
  }, [status, token, isTokenWellFormed]);

  // 未認証・プロフィール未作成のユーザーにとって'/'(リスト一覧)は保護されたルートで
  // 到達できないため、画面を離れる行き先はセッションの状態で決める。
  const signInDestination = status === 'needsProfile' ? '/profile-setup' : '/login';
  const goHome = () => router.replace(status === 'authenticated' ? '/' : signInDestination);
  const continueToSignIn = () => router.replace(signInDestination);

  const accept = async () => {
    if (!token || accepting) {
      return;
    }
    setAccepting(true);
    setActionError(null);
    try {
      const result = await acceptInvite(token, requestId);
      if (result.status === 'joined' || result.status === 'already-member') {
        router.replace(`/list/${result.listId}`);
        return;
      }
      setAcceptProblem(result.status);
    } catch (error) {
      setActionError(describeShareActionError(error));
    } finally {
      setAccepting(false);
    }
  };

  if (!isTokenWellFormed) {
    return <ProblemScreen problem="not-found" onClose={goHome} />;
  }

  if (previewFailed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          title="招待を確認できませんでした"
          description="招待の確認にはオンライン接続が必要です"
          retryLabel="再試行"
          onRetry={() => {
            setPreviewFailed(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  if (preview === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={120} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }

  if (preview.status !== 'valid') {
    return <ProblemScreen problem={preview.status} onClose={goHome} />;
  }

  const isSignedIn = status === 'authenticated';
  const problem = acceptProblem ? describeInviteProblem(acceptProblem) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Icon name="user-plus" color={Colors.primaryStrong} size={32} />
          <Text style={[Typography.caption, styles.cardCaption]}>
            {preview.inviterName ? `${preview.inviterName}さんから招待されています` : '招待されています'}
          </Text>
          <Text style={[Typography.title, styles.listName]}>{preview.listName}</Text>
          <Text style={[Typography.body, styles.cardCaption]}>現在のメンバー {preview.memberCount}人</Text>
        </View>

        {actionError ? <Banner message={actionError} variant="danger" /> : null}
        {problem ? <Banner message={`${problem.title}。${problem.description}`} variant="warning" /> : null}

        {isSignedIn && acceptProblem === 'limit-reached' ? (
          <>
            {/* 上限を超えたまま参加させない。プレビューは維持し、既存リストの
                アーカイブへ誘導する(仕様SHARE-02)。Premium導線はPAY-001で追加する。 */}
            <Button label="既存リストをアーカイブ" onPress={goHome} />
            <Button label="後で" onPress={goHome} variant="text" />
          </>
        ) : isSignedIn && acceptProblem ? (
          <Button label="閉じる" onPress={goHome} variant="secondary" />
        ) : isSignedIn ? (
          <>
            <Button label="参加する" onPress={accept} loading={accepting} />
            <Button label="あとで" onPress={goHome} variant="text" />
          </>
        ) : (
          <Button label="ログインして参加" onPress={continueToSignIn} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProblemScreen({ problem, onClose }: { problem: InviteProblem; onClose: () => void }) {
  const { title, description } = describeInviteProblem(problem);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ErrorState title={title} description={description} retryLabel="閉じる" onRetry={onClose} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[4],
  },
  card: {
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[6],
    borderRadius: Radius.card,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
    backgroundColor: Colors.surface,
  },
  cardCaption: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  listName: {
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});

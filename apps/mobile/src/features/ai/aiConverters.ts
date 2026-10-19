import { aiRatingSchema, aiRequestStatusSchema, aiResultSchema, type AiRating, type AiRequestStatus, type AiResult } from '@soroe/shared';

// aiRequests/{uid}_{requestId} を画面用の形へ変換する境界。結果がスキーマに合わなければ
// 例外ではなくnullにし、購読のコールバックを壊さない。
export type AiRequestView = {
  status: AiRequestStatus;
  result: AiResult | null;
  message: string | null;
  listId: string | null;
  rating: AiRating | null;
};

type FirestoreData = Record<string, any>;

export function toAiRequestView(data: FirestoreData): AiRequestView {
  const result = aiResultSchema.safeParse(data.result);
  const rating = aiRatingSchema.safeParse(data.rating);
  return {
    status: aiRequestStatusSchema.parse(data.status),
    result: result.success ? result.data : null,
    message: data.message ?? null,
    listId: data.listId ?? null,
    rating: rating.success ? rating.data : null,
  };
}

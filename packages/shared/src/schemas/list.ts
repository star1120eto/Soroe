import { z } from "zod";

// soroe-functional-specification.md LIST-03 / ITEM-01。
// createdAt等の時刻はFirestore Timestampをミリ秒epochへ正規化した値
// (プラットフォームごとにTimestamp実装が異なるため共有スキーマでは扱わない)。

export const listTypeSchema = z.enum(["shopping", "packing", "task"]);
export type ListType = z.infer<typeof listTypeSchema>;

export const listRoleSchema = z.enum(["owner", "editor"]);
export type ListRole = z.infer<typeof listRoleSchema>;

export const listSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  type: listTypeSchema,
  // デザインシステムのトークン名/Iconify IDを保持する。妥当な値かどうかは
  // UI側(design-system)の定義が正で、ここでは非空だけを保証する。
  color: z.string().min(1),
  icon: z.string().min(1),
  ownerId: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  archivedAt: z.number().int().positive().nullable(),
  deletedAt: z.number().int().positive().nullable(),
});
export type List = z.infer<typeof listSchema>;

export const listItemSchema = z.object({
  id: z.string().min(1),
  listId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().positive().nullable(),
  unit: z.string().trim().min(1).nullable(),
  category: z.string().trim().min(1).nullable(),
  note: z.string().max(500).nullable(),
  assigneeId: z.string().min(1).nullable(),
  dueAt: z.number().int().positive().nullable(),
  completedAt: z.number().int().positive().nullable(),
  completedBy: z.string().min(1).nullable(),
  // 手動並べ替え用。隣接2件の中間値を割り当てて再採番を避ける。
  sortOrder: z.number(),
  createdBy: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  deletedAt: z.number().int().positive().nullable(),
});
export type ListItem = z.infer<typeof listItemSchema>;

export const listMemberSchema = z.object({
  uid: z.string().min(1),
  listId: z.string().min(1),
  role: listRoleSchema,
  joinedAt: z.number().int().positive(),
});
export type ListMember = z.infer<typeof listMemberSchema>;

// 一覧画面が全リストの全項目を購読しなくて済むよう、ユーザー配下に置く
// 非正規化された参照(soroe-technology-stack-evaluation.md 9.2)。
export const userListRefSchema = z.object({
  listId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  type: listTypeSchema,
  color: z.string().min(1),
  icon: z.string().min(1),
  role: listRoleSchema,
  totalCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  memberCount: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  archivedAt: z.number().int().positive().nullable(),
  // LIST-006: 論理削除。archivedAtも同時に立つため、一覧画面の
  // `archivedAt == null` クエリからは削除済みリストも自動的に除外される。
  deletedAt: z.number().int().positive().nullable(),
});
export type UserListRef = z.infer<typeof userListRefSchema>;

// 作成・更新の入力。サーバー側で決まる値(id/時刻/作成者)は含めない。
export const createListInputSchema = listSchema.pick({
  name: true,
  type: true,
  color: true,
  icon: true,
});
export type CreateListInput = z.infer<typeof createListInputSchema>;

export const updateListInputSchema = createListInputSchema.partial();
export type UpdateListInput = z.infer<typeof updateListInputSchema>;

export const createListItemInputSchema = listItemSchema
  .pick({ name: true })
  .extend(
    listItemSchema
      .pick({
        quantity: true,
        unit: true,
        category: true,
        note: true,
        assigneeId: true,
        dueAt: true,
      })
      .partial().shape
  );
export type CreateListItemInput = z.infer<typeof createListItemInputSchema>;

export const updateListItemInputSchema = createListItemInputSchema.partial();
export type UpdateListItemInput = z.infer<typeof updateListItemInputSchema>;

// Callable Function `createList` の入出力(LIST-002)。requestIdは
// 同一uid+requestIdの再送を同じ結果にするための冪等性キー。
export const createListRequestSchema = createListInputSchema.extend({
  requestId: z.string().min(1),
});
export type CreateListRequest = z.infer<typeof createListRequestSchema>;

export const createListResponseSchema = z.object({
  listId: z.string().min(1),
});
export type CreateListResponse = z.infer<typeof createListResponseSchema>;

// LIST-006: 複製・アーカイブ・復元・削除のCallable Function入出力。
// 所有権判定と(複製・アーカイブ解除・復元では)Free上限の原子的判定を
// Functions側に寄せ、client writeでは行わない(firestore.rules参照)。
export const listIdInputSchema = z.object({
  listId: z.string().min(1),
});
export type ListIdInput = z.infer<typeof listIdInputSchema>;

export const archiveListRequestSchema = listIdInputSchema;
export type ArchiveListRequest = z.infer<typeof archiveListRequestSchema>;

export const deleteListRequestSchema = listIdInputSchema;
export type DeleteListRequest = z.infer<typeof deleteListRequestSchema>;

// unarchive/restore/duplicateはFree上限の再判定を伴うため、createListと同様に
// requestIdで冪等性を確保する。
export const unarchiveListRequestSchema = listIdInputSchema.extend({
  requestId: z.string().min(1),
});
export type UnarchiveListRequest = z.infer<typeof unarchiveListRequestSchema>;

export const restoreListRequestSchema = listIdInputSchema.extend({
  requestId: z.string().min(1),
});
export type RestoreListRequest = z.infer<typeof restoreListRequestSchema>;

export const duplicateListRequestSchema = listIdInputSchema.extend({
  requestId: z.string().min(1),
});
export type DuplicateListRequest = z.infer<typeof duplicateListRequestSchema>;

export const duplicateListResponseSchema = z.object({
  listId: z.string().min(1),
});
export type DuplicateListResponse = z.infer<typeof duplicateListResponseSchema>;

export const okResponseSchema = z.object({
  ok: z.literal(true),
});
export type OkResponse = z.infer<typeof okResponseSchema>;

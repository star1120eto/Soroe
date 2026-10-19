import { z } from "zod";

import { listTypeSchema } from "./list";
import { userProfileSchema } from "./userProfile";

// soroe-functional-specification.md 7章(TMPL-01/02, MYTM-01/02)。
// createdAt等の時刻はFirestore Timestampをミリ秒epochへ正規化した値(list.tsと同じ理由)。

export const templateCategorySchema = z.enum(["shopping", "family-trip", "outing", "outdoor", "school", "home"]);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

export const templateListTypeSchema = listTypeSchema;
export const templateLanguageSchema = userProfileSchema.shape.language;
export type TemplateLanguage = z.infer<typeof templateLanguageSchema>;

export const MAX_PARTY_SIZE = 10;
const partySizeSchema = z.number().int().min(1).max(MAX_PARTY_SIZE);

// ---- 公式テンプレート ----

const officialTemplateTextSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  notice: z.string().trim().min(1).max(300).nullable(),
});

const officialItemTextSchema = z.object({
  name: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(20).nullable(),
  category: z.string().trim().min(1).max(30).nullable(),
  note: z.string().max(500).nullable(),
});

export const officialTemplateItemSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number(),
  // perPersonがtrueのときは「1人あたり」の数量(人数補正で人数倍にする)。
  quantity: z.number().positive().nullable(),
  perPerson: z.boolean(),
  ja: officialItemTextSchema,
  en: officialItemTextSchema,
});
export type OfficialTemplateItem = z.infer<typeof officialTemplateItemSchema>;

export const officialTemplateSchema = z.object({
  id: z.string().min(1),
  category: templateCategorySchema,
  priority: z.number().int(),
  published: z.boolean(),
  listType: templateListTypeSchema,
  icon: z.string().min(1),
  adjustableByPeople: z.boolean(),
  defaultPartySize: partySizeSchema,
  hasSafetyNotice: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  ja: officialTemplateTextSchema,
  en: officialTemplateTextSchema,
});
export type OfficialTemplate = z.infer<typeof officialTemplateSchema>;

// リポジトリ内のJSON(テンプレート本体 + 項目)。validate/seedコマンドが検証する。
export const officialTemplateFileSchema = officialTemplateSchema
  .extend({ items: z.array(officialTemplateItemSchema).min(1) })
  .superRefine((file, ctx) => {
    if (file.itemCount !== file.items.length) {
      ctx.addIssue({ code: "custom", path: ["itemCount"], message: "itemCountがitemsの件数と一致しません" });
    }
    if (new Set(file.items.map((item) => item.id)).size !== file.items.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "項目IDが重複しています" });
    }
    if (file.hasSafetyNotice && (file.ja.notice === null || file.en.notice === null)) {
      ctx.addIssue({ code: "custom", path: ["hasSafetyNotice"], message: "安全注意は日英の両方が必要です" });
    }
    if (file.adjustableByPeople && !file.items.some((item) => item.perPerson)) {
      ctx.addIssue({ code: "custom", path: ["adjustableByPeople"], message: "人数補正には人数ごとの項目が1つ以上必要です" });
    }
  });
export type OfficialTemplateFile = z.infer<typeof officialTemplateFileSchema>;

// 人数補正: perPersonの項目だけ、数量を人数倍にする。数量が未設定ならそのまま。
export function scaleQuantity(item: { quantity: number | null; perPerson: boolean }, partySize: number): number | null {
  if (item.quantity === null || !item.perPerson) {
    return item.quantity;
  }
  // 0.1 * 3 のような浮動小数点の誤差(0.30000000000000004)が数量に出ないよう、小数第3位で丸める。
  return Math.round(item.quantity * partySize * 1000) / 1000;
}

// ---- マイテンプレート(users/{uid}/myTemplates/{id}) ----
// 共有メンバー・担当者・作成者・完了者・履歴は保存しない。

export const myTemplateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().positive().nullable(),
  unit: z.string().trim().min(1).max(20).nullable(),
  category: z.string().trim().min(1).max(30).nullable(),
  note: z.string().max(500).nullable(),
  // 作成時の初期チェック状態(元リストで完了していたか)。
  checked: z.boolean(),
});
export type MyTemplateItem = z.infer<typeof myTemplateItemSchema>;

export const myTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200).nullable(),
  listType: templateListTypeSchema,
  icon: z.string().min(1),
  color: z.string().min(1),
  itemCount: z.number().int().nonnegative(),
  items: z.array(myTemplateItemSchema),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type MyTemplate = z.infer<typeof myTemplateSchema>;

// ---- Callable Functions ----

export const saveMyTemplateRequestSchema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200).nullable(),
  requestId: z.string().min(1),
});
export type SaveMyTemplateRequest = z.infer<typeof saveMyTemplateRequestSchema>;

export const saveMyTemplateResponseSchema = z.object({ templateId: z.string().min(1) });
export type SaveMyTemplateResponse = z.infer<typeof saveMyTemplateResponseSchema>;

export const createListFromTemplateRequestSchema = z.object({
  source: z.enum(["official", "my"]),
  templateId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).max(500),
  partySize: partySizeSchema.optional(),
  language: templateLanguageSchema,
  requestId: z.string().min(1),
});
export type CreateListFromTemplateRequest = z.infer<typeof createListFromTemplateRequestSchema>;

export const createListFromTemplateResponseSchema = z.object({ listId: z.string().min(1) });
export type CreateListFromTemplateResponse = z.infer<typeof createListFromTemplateResponseSchema>;

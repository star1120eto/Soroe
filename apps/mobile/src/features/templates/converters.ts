import {
  myTemplateSchema,
  officialTemplateItemSchema,
  officialTemplateSchema,
  type MyTemplate,
  type OfficialTemplate,
  type OfficialTemplateItem,
} from '@soroe/shared';

import { requireMillis } from '../lists/converters';

// Firestore型(Timestamp等)をドメイン型へ変換する境界(lists/converters.tsと同じ方針)。
type FirestoreData = Record<string, any>;

export function toOfficialTemplate(id: string, data: FirestoreData): OfficialTemplate {
  return officialTemplateSchema.parse({
    id,
    category: data.category,
    priority: data.priority,
    published: data.published,
    listType: data.listType,
    icon: data.icon,
    adjustableByPeople: data.adjustableByPeople,
    defaultPartySize: data.defaultPartySize,
    hasSafetyNotice: data.hasSafetyNotice,
    itemCount: data.itemCount,
    ja: data.ja,
    en: data.en,
  });
}

export function toOfficialTemplateItem(id: string, data: FirestoreData): OfficialTemplateItem {
  return officialTemplateItemSchema.parse({
    id,
    sortOrder: data.sortOrder,
    quantity: data.quantity ?? null,
    perPerson: data.perPerson,
    ja: data.ja,
    en: data.en,
  });
}

export function toMyTemplate(id: string, data: FirestoreData): MyTemplate {
  // serverTimestamp未確定の間はローカル時刻で埋め、同期後の値で上書きされる。
  const now = Date.now();
  return myTemplateSchema.parse({
    id,
    title: data.title,
    description: data.description ?? null,
    listType: data.listType,
    icon: data.icon,
    color: data.color,
    itemCount: data.itemCount,
    items: data.items,
    createdAt: requireMillis(data.createdAt, now),
    updatedAt: requireMillis(data.updatedAt, now),
  });
}

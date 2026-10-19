import firestore from '@react-native-firebase/firestore';
import type { MyTemplate, MyTemplateItem, OfficialTemplate, OfficialTemplateItem } from '@soroe/shared';

import { parseValid, toMyTemplate, toOfficialTemplate, toOfficialTemplateItem } from './converters';

// テンプレートのFirestoreへの窓口。公式は読み取り専用(内容はseedで反映する)。マイテンプレートの
// 作成はCallable(TemplateCallables.ts)で、名前・説明の変更、項目を外す、削除はRulesの範囲で
// clientから直接書く(オフラインでも可)。Web版はTemplateRepository.web.ts(完全版SDK)。
// 並び替えはクライアントで行い、複合インデックスを要らなくしている。

const OFFICIAL = 'officialTemplates';

function myTemplatesCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('myTemplates');
}

export function subscribeToOfficialTemplates(
  onChange: (templates: OfficialTemplate[]) => void,
  onError: (error: Error) => void
): () => void {
  return firestore()
    .collection(OFFICIAL)
    .where('published', '==', true)
    .onSnapshot(
      (snapshot) =>
        onChange(parseValid(snapshot.docs, (doc) => toOfficialTemplate(doc.id, doc.data())).sort((a, b) => a.priority - b.priority)),
      onError
    );
}

export function subscribeToOfficialTemplateItems(
  templateId: string,
  onChange: (items: OfficialTemplateItem[]) => void,
  onError: (error: Error) => void
): () => void {
  return firestore()
    .collection(OFFICIAL)
    .doc(templateId)
    .collection('items')
    .onSnapshot(
      (snapshot) =>
        onChange(parseValid(snapshot.docs, (doc) => toOfficialTemplateItem(doc.id, doc.data())).sort((a, b) => a.sortOrder - b.sortOrder)),
      onError
    );
}

export function subscribeToMyTemplates(
  uid: string,
  onChange: (templates: MyTemplate[]) => void,
  onError: (error: Error) => void
): () => void {
  return myTemplatesCollection(uid).onSnapshot(
    (snapshot) =>
      onChange(parseValid(snapshot.docs, (doc) => toMyTemplate(doc.id, doc.data())).sort((a, b) => a.createdAt - b.createdAt)),
    onError
  );
}

export function subscribeToMyTemplate(
  uid: string,
  templateId: string,
  onChange: (template: MyTemplate | null) => void,
  onError: (error: Error) => void
): () => void {
  return myTemplatesCollection(uid)
    .doc(templateId)
    .onSnapshot((snapshot) => {
      const data = snapshot.data();
      // 不正なドキュメントは「見つからない」として扱う(例外でコールバックを壊さない)。
      onChange(data ? (parseValid([{ id: snapshot.id }], () => toMyTemplate(snapshot.id, data))[0] ?? null) : null);
    }, onError);
}

export function renameMyTemplate(
  uid: string,
  templateId: string,
  fields: { title: string; description: string | null }
): void {
  void myTemplatesCollection(uid)
    .doc(templateId)
    .update({ title: fields.title, description: fields.description, updatedAt: firestore.FieldValue.serverTimestamp() })
    .catch((error) => console.error('renameMyTemplate failed', error));
}

/** 残す項目だけを渡す(Rulesは項目が増える更新を拒否する)。 */
export function removeMyTemplateItems(uid: string, templateId: string, remainingItems: MyTemplateItem[]): void {
  void myTemplatesCollection(uid)
    .doc(templateId)
    .update({
      items: remainingItems,
      itemCount: remainingItems.length,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    })
    .catch((error) => console.error('removeMyTemplateItems failed', error));
}

export function deleteMyTemplate(uid: string, templateId: string): void {
  void myTemplatesCollection(uid)
    .doc(templateId)
    .delete()
    .catch((error) => console.error('deleteMyTemplate failed', error));
}

export * from './TemplateCallables';

import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';

import { webFirestore } from '@/lib/firebase/webFirestore';

import { parseValid, toMyTemplate, toOfficialTemplate, toOfficialTemplateItem } from './converters';
import type * as Native from './TemplateRepository';

// TemplateRepository.ts のWeb版。RN Firebaseのweb実装はlite SDKでonSnapshotを使えないため、
// Firestoreを直接扱う部分を完全版のfirebase JS SDKで実装する。各関数は `typeof Native.xxx` で
// 型を付け、ネイティブ版とシグネチャが食い違えばtypecheckで落ちるようにしている。

const myTemplates = (uid: string) => collection(webFirestore(), 'users', uid, 'myTemplates');

export const subscribeToOfficialTemplates: typeof Native.subscribeToOfficialTemplates = (onChange, onError) =>
  onSnapshot(
    query(collection(webFirestore(), 'officialTemplates'), where('published', '==', true)),
    (snapshot) =>
      onChange(parseValid(snapshot.docs, (d) => toOfficialTemplate(d.id, d.data())).sort((a, b) => a.priority - b.priority)),
    onError
  );

export const subscribeToOfficialTemplateItems: typeof Native.subscribeToOfficialTemplateItems = (
  templateId,
  onChange,
  onError
) =>
  onSnapshot(
    collection(webFirestore(), 'officialTemplates', templateId, 'items'),
    (snapshot) =>
      onChange(parseValid(snapshot.docs, (d) => toOfficialTemplateItem(d.id, d.data())).sort((a, b) => a.sortOrder - b.sortOrder)),
    onError
  );

export const subscribeToMyTemplates: typeof Native.subscribeToMyTemplates = (uid, onChange, onError) =>
  onSnapshot(
    myTemplates(uid),
    (snapshot) =>
      onChange(parseValid(snapshot.docs, (d) => toMyTemplate(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt)),
    onError
  );

export const subscribeToMyTemplate: typeof Native.subscribeToMyTemplate = (uid, templateId, onChange, onError) =>
  onSnapshot(
    doc(myTemplates(uid), templateId),
    (snapshot) => {
      const data = snapshot.data();
      onChange(data ? (parseValid([{ id: snapshot.id }], () => toMyTemplate(snapshot.id, data))[0] ?? null) : null);
    },
    onError
  );

export const renameMyTemplate: typeof Native.renameMyTemplate = (uid, templateId, fields) => {
  void updateDoc(doc(myTemplates(uid), templateId), {
    title: fields.title,
    description: fields.description,
    updatedAt: serverTimestamp(),
  }).catch((error) => console.error('renameMyTemplate failed', error));
};

export const removeMyTemplateItems: typeof Native.removeMyTemplateItems = (uid, templateId, remainingItems) => {
  void updateDoc(doc(myTemplates(uid), templateId), {
    items: remainingItems,
    itemCount: remainingItems.length,
    updatedAt: serverTimestamp(),
  }).catch((error) => console.error('removeMyTemplateItems failed', error));
};

export const deleteMyTemplate: typeof Native.deleteMyTemplate = (uid, templateId) => {
  void deleteDoc(doc(myTemplates(uid), templateId)).catch((error) => console.error('deleteMyTemplate failed', error));
};

export * from './TemplateCallables';

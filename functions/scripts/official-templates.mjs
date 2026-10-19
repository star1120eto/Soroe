// 公式テンプレート(TMPL-001)の検証と投入。内容は functions/data/official-templates/*.json
// (リポジトリでレビューし、このコマンドで反映する。管理画面は作らない)。
//
// 使い方(リポジトリルートで。先に pnpm run build:shared):
//   pnpm run templates:validate          # 全JSONを共有スキーマで検証する
//   pnpm run templates:seed              # Firestore Emulatorへ投入する(冪等。同じIDは上書き、データに無いIDは削除)
//
// seedはEmulator専用。FIRESTORE_EMULATOR_HOST が無ければ、本番へ誤って書かないよう即座に終了する
// (本番への反映は、デプロイ手順を決める際に別途用意する)。

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { officialTemplateFileSchema } from '../../packages/shared/dist/index.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/official-templates');

function loadTemplates() {
  const files = readdirSync(DATA_DIR).filter((name) => name.endsWith('.json')).sort();
  const problems = [];
  const templates = [];
  const seen = new Set();
  for (const name of files) {
    const json = JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8'));
    const result = officialTemplateFileSchema.safeParse(json);
    if (!result.success) {
      problems.push(`${name}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' / ')}`);
      continue;
    }
    if (name !== `${result.data.id}.json`) {
      problems.push(`${name}: ファイル名が id(${result.data.id})と一致しません`);
    }
    if (seen.has(result.data.id)) {
      problems.push(`${name}: id(${result.data.id})が重複しています`);
    }
    seen.add(result.data.id);
    templates.push(result.data);
  }
  return { templates, problems };
}

async function validate() {
  const { templates, problems } = loadTemplates();
  if (problems.length > 0) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${templates.length}件の公式テンプレートが有効です`);
  return templates;
}

async function seed() {
  const templates = await validate();
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('FIRESTORE_EMULATOR_HOST が未設定です。seedはEmulator専用です(emulators:exec 経由で実行してください)');
    process.exit(1);
  }
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'soroe-1850a' });
  const db = getFirestore();

  for (const { items, id, ...template } of templates) {
    const ref = db.collection('officialTemplates').doc(id);
    await ref.set(template);
    // 項目は、JSONにあるものだけに揃える(消した項目が残らないよう、いったん既存を消してから書く)。
    const existing = await ref.collection('items').get();
    const batch = db.batch();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    for (const { id: itemId, ...item } of items) {
      batch.set(ref.collection('items').doc(itemId), item);
    }
    await batch.commit();
    console.log(`  ${id}(${items.length}項目)`);
  }
  // JSONから消した(リネームした)テンプレートが公開のまま残らないよう、データに無いものは項目ごと取り除く。
  const keep = new Set(templates.map((template) => template.id));
  const stored = await db.collection('officialTemplates').get();
  for (const doc of stored.docs.filter((d) => !keep.has(d.id))) {
    const items = await doc.ref.collection('items').get();
    const batch = db.batch();
    items.docs.forEach((item) => batch.delete(item.ref));
    batch.delete(doc.ref);
    await batch.commit();
    console.log(`  ${doc.id}(データに無いため削除)`);
  }
  console.log(`✓ ${templates.length}件を投入しました`);
}

const command = process.argv[2];
if (command === 'validate') {
  await validate();
} else if (command === 'seed') {
  await seed();
} else {
  console.error('使い方: node official-templates.mjs <validate|seed>');
  process.exit(1);
}

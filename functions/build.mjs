import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedEntry = path.resolve(here, '../packages/shared/src/index.ts');

// Cloud Buildはnpmでdependenciesを解決するため、pnpm固有の`workspace:`
// プロトコルを理解できない。@soroe/sharedをバンドルへ取り込み、デプロイ
// 成果物をworkspaceに依存しない単一ファイルにする。
// firebase-admin/firebase-functionsはCloud Build側でインストールされる
// 実依存なのでexternalのままにし、バンドルを肥大させない。
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-functions'],
  // package.jsonへ`workspace:*`として宣言するとCloud Buildのnpm installが
  // 落ちるため、依存として持たずここでソースへ直接解決する。
  alias: { '@soroe/shared': sharedEntry },
  logLevel: 'info',
});

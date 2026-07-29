import path from 'node:path';

import { defineConfig } from 'vitest/config';

// build.mjsのesbuild alias / tsconfigのpathsと揃える。
// @soroe/sharedはdependenciesに宣言せずバンドルへ取り込む方式のため、
// テスト実行時もソースを直接解決する。
export default defineConfig({
  resolve: {
    alias: {
      '@soroe/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
});

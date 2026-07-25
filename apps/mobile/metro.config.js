const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace対応。既定ではMetroがworkspaceルート基準でモジュールを
// 探し、apps/mobile/node_modules配下の実体(.pnpmへのsymlink)を辿れずに
// expo-router/entryの解決へ失敗する。
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpmはsymlinkでnode_modulesを構成するため、実体パスへ辿らせる。
// disableHierarchicalLookupはnpm/yarn workspace向けの設定で、pnpmの
// .pnpm配下への多段symlinkを辿れなくなるため有効化しない。
config.resolver.unstable_enableSymlinks = true;

module.exports = config;

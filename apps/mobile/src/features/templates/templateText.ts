import type { OfficialTemplate, OfficialTemplateItem, TemplateLanguage } from '@soroe/shared';

// 公式テンプレートは共通IDに対して言語別の名称・説明・項目を持つ(仕様 2.6)。
// 設定の言語(profile.language)で表示文言を選ぶ。

export function localizeTemplate(template: OfficialTemplate, language: TemplateLanguage) {
  return template[language];
}

export function localizeItem(item: OfficialTemplateItem, language: TemplateLanguage) {
  return item[language];
}

import type { OfficialTemplate, OfficialTemplateItem } from '@soroe/shared';

import { localizeItem, localizeTemplate } from '../templateText';

const template: OfficialTemplate = {
  id: 'day-hike',
  category: 'outdoor',
  priority: 10,
  published: true,
  listType: 'packing',
  icon: 'suitcase',
  adjustableByPeople: true,
  defaultPartySize: 2,
  hasSafetyNotice: true,
  itemCount: 1,
  ja: { title: '日帰り登山', description: '説明', notice: '注意' },
  en: { title: 'Day hike', description: 'Description', notice: 'Notice' },
};

const item: OfficialTemplateItem = {
  id: 'water',
  sortOrder: 1000,
  quantity: 1,
  perPerson: true,
  ja: { name: '水', unit: 'L', category: '飲食', note: null },
  en: { name: 'Water', unit: 'L', category: 'Food', note: null },
};

describe('localizeTemplate / localizeItem', () => {
  it('picks the Japanese text for ja and the English text for en', () => {
    expect(localizeTemplate(template, 'ja').title).toBe('日帰り登山');
    expect(localizeTemplate(template, 'en').title).toBe('Day hike');
    expect(localizeItem(item, 'ja').name).toBe('水');
    expect(localizeItem(item, 'en').name).toBe('Water');
  });

  it('keeps an unset notice as null', () => {
    expect(localizeTemplate({ ...template, ja: { ...template.ja, notice: null } }, 'ja').notice).toBeNull();
  });
});

import { toMyTemplate, toOfficialTemplate, toOfficialTemplateItem } from '../converters';

const officialData = {
  category: 'outdoor',
  priority: 10,
  published: true,
  listType: 'packing',
  icon: 'suitcase',
  adjustableByPeople: true,
  defaultPartySize: 2,
  hasSafetyNotice: false,
  itemCount: 1,
  ja: { title: '日帰り登山', description: '説明', notice: null },
  en: { title: 'Day hike', description: 'Description', notice: null },
};

describe('template converters', () => {
  it('converts an official template document', () => {
    expect(toOfficialTemplate('day-hike', officialData)).toMatchObject({ id: 'day-hike', category: 'outdoor', itemCount: 1 });
  });

  it('converts an official template item', () => {
    const item = toOfficialTemplateItem('water', {
      sortOrder: 1000,
      quantity: 1,
      perPerson: true,
      ja: { name: '水', unit: 'L', category: '飲食', note: null },
      en: { name: 'Water', unit: 'L', category: 'Food', note: null },
    });
    expect(item).toMatchObject({ id: 'water', perPerson: true });
  });

  it('converts a my-template with Timestamp-like values, and tolerates a pending server timestamp', () => {
    const template = toMyTemplate('t1', {
      title: 'キャンプ',
      description: null,
      listType: 'packing',
      icon: 'suitcase',
      color: 'primary',
      itemCount: 1,
      items: [{ id: 'a', name: 'テント', quantity: null, unit: null, category: null, note: null, checked: false }],
      createdAt: { toMillis: () => 1000 },
      updatedAt: null,
    });
    expect(template.createdAt).toBe(1000);
    expect(template.updatedAt).toBeGreaterThan(0);
    expect(template.items).toHaveLength(1);
  });
});

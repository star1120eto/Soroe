import { initialSelection, toggleSelection } from '../templateSelection';

describe('template item selection', () => {
  it('starts with every item selected', () => {
    expect([...initialSelection(['a', 'b', 'c'])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes a selected item and adds it back, without mutating the original set', () => {
    const selected = initialSelection(['a', 'b']);

    const without = toggleSelection(selected, 'a');
    expect([...without]).toEqual(['b']);
    expect([...selected].sort()).toEqual(['a', 'b']);

    expect([...toggleSelection(without, 'a')].sort()).toEqual(['a', 'b']);
  });
});

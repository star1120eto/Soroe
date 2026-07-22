import { render } from '@testing-library/react-native';

import { Icon } from '../Icon';
import { phIconPaths } from '../ph-icon-paths';

describe('Icon', () => {
  it('renders every design-system icon without throwing', async () => {
    for (const name of Object.keys(phIconPaths) as (keyof typeof phIconPaths)[]) {
      await render(<Icon name={name} color="#000000" />);
    }
  });
});

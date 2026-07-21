import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the get started hint', async () => {
    const { getByText } = await render(<HomeScreen />);

    expect(getByText('get started')).toBeTruthy();
  });
});

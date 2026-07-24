import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as AuthGateway from '../AuthGateway';
import * as SessionRepository from '../SessionRepository';
import { SessionProvider, useSession } from '../SessionProvider';

jest.mock('../AuthGateway', () => ({
  subscribeToAuthState: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('../SessionRepository', () => ({
  getUserProfile: jest.fn(),
  createUserProfile: jest.fn(),
}));

const mockFirebaseUser = { uid: 'uid-1' } as import('@react-native-firebase/auth').FirebaseAuthTypes.User;

describe('SessionProvider', () => {
  let authStateCallback: (user: typeof mockFirebaseUser | null) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AuthGateway.subscribeToAuthState).mockImplementation((callback) => {
      authStateCallback = callback;
      return jest.fn();
    });
  });

  it('starts in the loading state', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    expect(result.current.status).toBe('loading');
  });

  it('becomes unauthenticated when there is no firebase user', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(null));

    expect(result.current.status).toBe('unauthenticated');
  });

  it('becomes authenticated without creating a profile when one already exists', async () => {
    jest.mocked(SessionRepository.getUserProfile).mockResolvedValue({
      uid: 'uid-1',
      displayName: 'たろう',
      language: 'ja',
      createdAt: 1,
    });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(mockFirebaseUser));
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    expect(SessionRepository.createUserProfile).not.toHaveBeenCalled();
  });

  it('creates a placeholder profile on first sign-in', async () => {
    jest.mocked(SessionRepository.getUserProfile).mockResolvedValue(null);
    jest.mocked(SessionRepository.createUserProfile).mockResolvedValue({
      uid: 'uid-1',
      displayName: '名称未設定',
      language: 'ja',
      createdAt: 1,
    });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(mockFirebaseUser));
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    expect(SessionRepository.createUserProfile).toHaveBeenCalledWith('uid-1', {
      displayName: '名称未設定',
      language: 'ja',
    });
  });
});

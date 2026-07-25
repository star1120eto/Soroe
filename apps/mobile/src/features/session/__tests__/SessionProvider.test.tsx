import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as AuthGateway from '../AuthGateway';
import * as SessionRepository from '../SessionRepository';
import { SessionProvider, useSession } from '../SessionProvider';

jest.mock('../AuthGateway', () => ({
  subscribeToAuthState: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('../SessionRepository', () => ({
  getUserProfile: jest.fn(),
  createUserProfile: jest.fn(),
}));

const mockFirebaseUser = { uid: 'uid-1' } as import('@react-native-firebase/auth').FirebaseAuthTypes.User;

const existingProfile = {
  uid: 'uid-1',
  displayName: 'たろう',
  language: 'ja' as const,
  createdAt: 1,
};

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
    expect(result.current.profile).toBeNull();
  });

  it('becomes authenticated and exposes the profile when one already exists', async () => {
    jest.mocked(SessionRepository.getUserProfile).mockResolvedValue(existingProfile);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(mockFirebaseUser));
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    expect(result.current.profile).toEqual(existingProfile);
    expect(SessionRepository.createUserProfile).not.toHaveBeenCalled();
  });

  it('becomes needsProfile without creating one when the user has no profile yet', async () => {
    jest.mocked(SessionRepository.getUserProfile).mockResolvedValue(null);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(mockFirebaseUser));
    await waitFor(() => expect(result.current.status).toBe('needsProfile'));

    expect(SessionRepository.createUserProfile).not.toHaveBeenCalled();
  });

  it('createProfile stores the profile and becomes authenticated', async () => {
    jest.mocked(SessionRepository.getUserProfile).mockResolvedValue(null);
    jest.mocked(SessionRepository.createUserProfile).mockResolvedValue(existingProfile);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(mockFirebaseUser));
    await waitFor(() => expect(result.current.status).toBe('needsProfile'));

    await act(() => result.current.createProfile({ displayName: 'たろう', language: 'ja' }));

    expect(SessionRepository.createUserProfile).toHaveBeenCalledWith('uid-1', {
      displayName: 'たろう',
      language: 'ja',
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.profile).toEqual(existingProfile);
  });

  it('createProfile rejects when no firebase user is signed in', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await act(() => authStateCallback(null));

    await expect(result.current.createProfile({ displayName: 'たろう', language: 'ja' })).rejects.toThrow();
  });
});

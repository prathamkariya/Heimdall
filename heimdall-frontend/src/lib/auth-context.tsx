import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { apiFetch, initializeAuth } from './api';

/* ── Typed credential shapes (replaces `any`) ── */
interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in?: number;
}

interface SseTokenResponse {
  sse_token: string;
}

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  getSseToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Backend ACCESS_TOKEN_EXPIRE_MINUTES = 30.
 * Refresh at 25 minutes to stay well within the window.
 */
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize the api fetcher with the token
  useEffect(() => {
    initializeAuth(() => accessToken || '');
  }, [accessToken]);

  // Attempt silent refresh on mount to restore session
  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const res = await apiFetch('/auth/refresh', { method: 'POST' }) as TokenResponse;
        if (mounted) setAccessToken(res.access_token);
      } catch (err) {
        console.debug("Silent refresh failed (expected if no cookie or expired)", err)
        console.debug('No valid session cookie found');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    restoreSession();
    return () => { mounted = false; };
  }, []);

  // Handle automatic refresh when we have an access token
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch('/auth/refresh', { method: 'POST' }) as TokenResponse;
        setAccessToken(res.access_token);
      } catch (err) {
        console.error('Failed to refresh token', err);
        setAccessToken(null);
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [accessToken]);

  const login = async (credentials: LoginCredentials) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }) as TokenResponse;
    setAccessToken(res.access_token);
  };

  const register = async (credentials: RegisterCredentials) => {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }) as TokenResponse;
    setAccessToken(res.access_token);
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error', e);
    }
    setAccessToken(null);
  };

  const logoutAll = async () => {
    try {
      await apiFetch('/auth/logout-all', { method: 'POST' });
    } catch (e) {
      console.error('Logout all error', e);
    }
    setAccessToken(null);
  };

  const getSseToken = async () => {
    const res = await apiFetch('/auth/sse-token', { method: 'POST' }) as SseTokenResponse;
    return res.sse_token;
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
        register,
        logout,
        logoutAll,
        getSseToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

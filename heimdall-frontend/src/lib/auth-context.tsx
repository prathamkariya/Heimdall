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
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('heimdall_access_token');
  });
  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    return localStorage.getItem('heimdall_refresh_token');
  });

  // Keep localStorage in sync
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('heimdall_access_token', accessToken);
    } else {
      localStorage.removeItem('heimdall_access_token');
    }
  }, [accessToken]);

  useEffect(() => {
    if (refreshToken) {
      localStorage.setItem('heimdall_refresh_token', refreshToken);
    } else {
      localStorage.removeItem('heimdall_refresh_token');
    }
  }, [refreshToken]);

  // Initialize the api fetcher with the token
  useEffect(() => {
    initializeAuth(
      () => accessToken || ''
    );
  }, [accessToken]);

  // Handle automatic refresh when we have a refresh token
  useEffect(() => {
    if (!refreshToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        }) as TokenResponse;
        setAccessToken(res.access_token);
      } catch (err) {
        console.error('Failed to refresh token', err);
        setAccessToken(null);
        setRefreshToken(null);
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshToken]);

  const login = async (credentials: LoginCredentials) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }) as TokenResponse;
    setAccessToken(res.access_token);
    setRefreshToken(res.refresh_token);
  };

  const register = async (credentials: RegisterCredentials) => {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }) as TokenResponse;
    setAccessToken(res.access_token);
    setRefreshToken(res.refresh_token);
  };

  const logout = async () => {
    if (refreshToken) {
      try {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (e) {
        console.error('Logout error', e);
      }
    }
    setAccessToken(null);
    setRefreshToken(null);
  };

  const logoutAll = async () => {
    try {
      await apiFetch('/auth/logout-all', {
        method: 'POST',
      });
    } catch (e) {
      console.error('Logout all error', e);
    }
    setAccessToken(null);
    setRefreshToken(null);
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

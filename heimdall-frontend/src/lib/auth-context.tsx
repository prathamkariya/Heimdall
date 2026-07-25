import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { apiFetch, initializeAuth } from './api';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (credentials: any) => Promise<void>;
  register: (credentials: any) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  getSseToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // Initialize the api fetcher with the token
  useEffect(() => {
    initializeAuth(
      () => accessToken || '',
      (token: string) => setAccessToken(token)
    );
  }, [accessToken]);

  // Handle automatic refresh when we have a refresh token
  useEffect(() => {
    if (!refreshToken) return;
    
    // Very simple refresh loop (could be optimized to run before expiry)
    // The API response includes `expires_in` (seconds).
    // For now, we'll just try to refresh every 4 minutes (assuming 5 min TTL)
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        setAccessToken(res.access_token);
      } catch (err) {
        console.error('Failed to refresh token', err);
        setAccessToken(null);
        setRefreshToken(null);
      }
    }, 4 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [refreshToken]);

  const login = async (credentials: any) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setAccessToken(res.access_token);
    setRefreshToken(res.refresh_token);
  };

  const register = async (credentials: any) => {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
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
    const res = await apiFetch('/auth/sse-token', { method: 'POST' }) as any;
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

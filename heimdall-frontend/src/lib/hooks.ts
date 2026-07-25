import { useState, useCallback } from 'react';
import { apiFetch } from './api';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lightweight data-fetching hook built on the existing apiFetch.
 * Returns { data, loading, error, execute, reset }.
 *
 * Not a replacement for React Query — this is intentionally simple,
 * matching the scale of this app's data needs without adding deps.
 */
export function useApiFetch<T = unknown>() {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (endpoint: string, options?: RequestInit): Promise<T | null> => {
    setState({ data: null, loading: true, error: null });
    try {
      const result = await apiFetch(endpoint, options) as T;
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (err: any) {
      const message = err?.message || 'An error occurred';
      setState({ data: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

const BASE_URL = '/api/v1';

export let getAccessToken = () => '';
export let setAccessToken = (_token: string) => {};

export function initializeAuth(getter: () => string, setter: (t: string) => void) {
  getAccessToken = getter;
  setAccessToken = setter;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  
  // Basic 401 interceptor logic could go here, but since the token is short-lived,
  // we might want a mechanism to refresh it.
  
  if (!response.ok) {
    let message = 'An error occurred';
    try {
      const errorData = await response.json();
      if (Array.isArray(errorData.detail)) {
        message = errorData.detail.map((err: any) => err.msg).join(', ');
      } else {
        message = errorData.detail || message;
      }
    } catch {
      // Ignored
    }
    throw new Error(message);
  }
  
  // If no content, just return null
  if (response.status === 204) return null;
  
  return response.json();
}

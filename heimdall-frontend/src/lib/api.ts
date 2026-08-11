const BASE_URL = '/api/v1';

let getAccessToken = () => '';

export function initializeAuth(getter: () => string) {
  getAccessToken = getter;
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

  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  
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
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.blob();
}

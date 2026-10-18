const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://balakavach-be.onrender.com/api/v1';
const rawBase = configuredBaseUrl.replace(/\/+$/, '');
const baseUrl = rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`;

export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });

  const payload = response.status === 204
    ? { data: null }
    : await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `API request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return payload?.data;
}

export function apiGet(path, options = {}) {
  return apiRequest(path, options);
}

export function apiPost(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'POST', body });
}

export function apiDelete(path, options = {}) {
  return apiRequest(path, { ...options, method: 'DELETE' });
}

export function apiPut(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'PUT', body });
}

export function apiPatch(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'PATCH', body });
}

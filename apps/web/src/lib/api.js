const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

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

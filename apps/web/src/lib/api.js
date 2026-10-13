const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

export async function apiGet(path, { signal } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status}).`);
  }

  const payload = await response.json();
  return payload.data;
}

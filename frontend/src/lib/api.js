const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(path, { token, ...options } = {}) {
  const endpoint = API_BASE_URL ? `${API_BASE_URL}${path}` : `/api${path}`;
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

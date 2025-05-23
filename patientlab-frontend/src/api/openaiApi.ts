// @see https://platform.openai.com/docs/api-reference/realtime-sessions/create

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface SessionPayload {
  client_secret?: { value?: string };
  id: string;
  expires_at: number;
}

/**
 * POST /api/v1/session  ->  { client_secret: { value: "ek_…" }, … }
 *
 * Returns { token, expiresAt }
 */
export async function fetchEphemeralToken(): Promise<{
  token: string;
  expiresAt: number;
}> {
  const res = await fetch(`${API_BASE_URL}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Token endpoint failed (${res.status})`);
  }

  const data: SessionPayload = await res.json();

  const token = data.client_secret?.value;
  if (!token) throw new Error('Token missing in response');

  return { token, expiresAt: data.expires_at };
}
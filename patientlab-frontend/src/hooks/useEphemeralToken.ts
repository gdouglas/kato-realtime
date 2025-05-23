import { useState, useCallback } from 'react';
import { fetchEphemeralToken } from '@/api/openaiApi';

type TokenState =
  | { status: 'idle'; token: null; expiresAt: null; error: null }
  | { status: 'loading'; token: null; expiresAt: null; error: null }
  | { status: 'success'; token: string; expiresAt: number; error: null }
  | { status: 'error'; token: null; expiresAt: null; error: string };

export function useEphemeralToken() {
  const [state, setState] = useState<TokenState>({
    status: 'idle',
    token: null,
    expiresAt: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ status: 'loading', token: null, expiresAt: null, error: null });
    try {
      const { token, expiresAt } = await fetchEphemeralToken();
      setState({ status: 'success', token, expiresAt, error: null });
    } catch (err: any) {
      setState({
        status: 'error',
        token: null,
        expiresAt: null,
        error: err?.message ?? 'Unknown error',
      });
    }
  }, []);

  return { ...state, load };
}

// src/routes/SpeakPage.tsx
import { useEffect, useRef } from 'react';
import { useEphemeralToken } from '@/hooks/useEphemeralToken';
import { createRealtimeConnection } from '@/services/realtimeConnection';

export default function SpeakPage() {
  const { tokenStatus, token, error, load } = useEphemeralToken();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didFetchToken = useRef(false);

  // fetch immediately on mount
  useEffect(() => {
    if (didFetchToken.current) {
      return; // don't fetch the token twice, it's in progress
    }
    didFetchToken.current = true;
    load();
  }, [load]);

  // once we have a token, create the connection
  useEffect(() => {
    if (tokenStatus === 'success' && token) {
      createRealtimeConnection(token, audioRef, 'opus', true).catch(console.error);
    }
  }, [tokenStatus, token]);

  /* ---------- trivial UI ---------- */
  if (tokenStatus === 'loading') return <p>Connecting…</p>;
  if (tokenStatus === 'error')   return <p style={{ color: 'crimson' }}>❌ {error}<br/><button onClick={load}>Retry</button></p>;

  return (
    <div>
      <h1>Speak Mode</h1>
      <audio ref={audioRef} />
      {/* rest of your page */}
    </div>
  );
}

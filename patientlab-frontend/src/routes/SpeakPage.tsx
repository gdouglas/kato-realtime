import React, { useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { connectionMachine } from '../machines/connectionMachine';
import { createWebRTCConnection } from '../services/webrtcService';

// A little spinner + error‐badge component
const Spinner = () => <div>🔄 Connecting…</div>;
const ErrorIndicator: React.FC<{ message?: string; onRetry(): void }> = ({ message, onRetry }) => (
  <div style={{ color: 'crimson' }}>
    <p>❌ {message ?? 'Unknown error'}</p>
    <button onClick={onRetry}>Retry</button>
  </div>
);

const SpeakPage: React.FC = () => {
  const [state, send] = useMachine(connectionMachine);

  // start the fetch on mount
  useEffect(() => {
    send({ type: 'INIT_CONNECTION' });
  }, [send]);

  // once we’re in the final “connected” state, hand off to WebRTC
  useEffect(() => {
    if (state.matches('connected') && state.context.token) {
      createWebRTCConnection(state.context.token);
    }
  }, [state]);

  // render a spinner during the fetch
  if (state.matches('idle') || state.matches('fetchingToken')) {
    return <Spinner />;
  }

  // render an error badge when the token service fails
  if (state.matches('connectionError')) {
    return <ErrorIndicator message={state.context.error} onRetry={() => send({ type: 'RETRY' })} />;
  }

  // finally, your normal “Speak” UI
  return (
    <div>
      <h1>Speak Mode</h1>
      {/* …your real audio controls here… */}
    </div>
  );
};

export default SpeakPage;
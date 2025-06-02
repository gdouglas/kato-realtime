"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SessionStatus, AgentConfig } from '@/app/types';
import { useEventBus } from './EventBusContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { useAgentLifecycle } from './AgentLifecycleContext';

/**
 * KatoRTCContext - Simplified wrapper around XState machine
 * 
 * This context now serves as a simple interface to the XState machine,
 * which is the single source of truth for WebRTC connections.
 * It provides backward compatibility for components that expect this interface.
 */

interface KatoRTCContextType {
  sessionStatus: SessionStatus;
  dcRef: React.MutableRefObject<RTCDataChannel | null>;
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  connectKatoRTC: () => void;
  disconnectKatoRTC: (data?: {isSwitchingAgent?: boolean}) => void;
}

const KatoRTCContext = createContext<KatoRTCContextType | undefined>(undefined);

export const KatoRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus();
  const agentLifecycle = useAgentLifecycle();

  // Get values from XState machine context - this is our single source of truth
  const xstateSessionStatus = agentLifecycle.state.context.sessionStatus;
  const xstateDc = agentLifecycle.state.context.dc;
  const xstateAudioOutputEnabled = agentLifecycle.state.context.audioOutputEnabled;

  // Create a ref that mirrors the XState dc for backward compatibility
  const localDcRef = useRef<RTCDataChannel | null>(null);
  useEffect(() => {
    localDcRef.current = xstateDc || null;
  }, [xstateDc]);

  // Local state for isAudioPlaybackEnabled, synchronized with XState
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    xstateAudioOutputEnabled ?? true
  );

  // Sync local state with XState when it changes
  useEffect(() => {
    if (typeof xstateAudioOutputEnabled === 'boolean') {
      setIsAudioPlaybackEnabled(xstateAudioOutputEnabled);
    }
  }, [xstateAudioOutputEnabled]);

  // Connect function - delegates to XState machine
  const connectKatoRTC = useCallback(() => {
    console.log("[KatoRTCContext] connectKatoRTC called, sending RETRY to XState machine");
    agentLifecycle.send({ type: 'RETRY' }); 
  }, [agentLifecycle]);

  // Disconnect function - delegates to XState machine
  const disconnectKatoRTC = useCallback((data?: {isSwitchingAgent?: boolean}) => {
    console.log("[KatoRTCContext] disconnectKatoRTC called, sending USER_REQUESTED_DISCONNECT to XState machine");
    agentLifecycle.send({ type: 'USER_REQUESTED_DISCONNECT' });
  }, [agentLifecycle]);

  // Update audio playback setting through XState machine
  const handleSetIsAudioPlaybackEnabled = useCallback((valueOrFn: React.SetStateAction<boolean>) => {
    const newValue = typeof valueOrFn === 'function' 
      ? valueOrFn(isAudioPlaybackEnabled) 
      : valueOrFn;
    
    console.log("[KatoRTCContext] setIsAudioPlaybackEnabled called with value:", newValue);
    
    // Send settings update to XState machine
    agentLifecycle.send({ 
      type: 'USER_UPDATED_SETTINGS', 
      micEnabled: agentLifecycle.state.context.micEnabled ?? true,
      audioOutputEnabled: newValue,
      pushToTalk: agentLifecycle.state.context.pushToTalk ?? false
    });
  }, [agentLifecycle, isAudioPlaybackEnabled]);

  return (
    <KatoRTCContext.Provider value={{
      sessionStatus: xstateSessionStatus as SessionStatus,
      dcRef: localDcRef,
      isAudioPlaybackEnabled,
      setIsAudioPlaybackEnabled: handleSetIsAudioPlaybackEnabled,
      connectKatoRTC,
      disconnectKatoRTC,
    }}>
      {children}
    </KatoRTCContext.Provider>
  );
};

export const useKatoRTCContext = () => {
  const context = useContext(KatoRTCContext);
  if (context === undefined) {
    throw new Error('useKatoRTCContext must be used within a KatoRTCProvider');
  }
  return context;
};

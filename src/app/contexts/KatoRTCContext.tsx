"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SessionStatus, AgentConfig } from '@/app/types';
// import { useKatoRTC as useOriginalKatoRTCHook } from '@/app/hooks/useKatoRTC'; // DELETED
import { useEventBus } from './EventBusContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { v4 as uuidv4 } from "uuid"; 
import { useAgentLifecycle } from './AgentLifecycleContext'; // Import XState hook

// Add new KatoEvents (assuming they would be defined in KatoEvents.ts)
// For the purpose of this edit, we'll just use string literals directly
// but in a real scenario, these should be added to the KatoEvents enum/object
const USER_SPEECH_STARTED_EVENT = 'USER_SPEECH_STARTED';
const USER_SPEECH_STOPPED_EVENT = 'USER_SPEECH_STOPPED';
const AGENT_RESPONSE_COMPLETED_EVENT = 'AGENT_RESPONSE_COMPLETED';

// createServerEventHandler is problematic as it emits many events to eventBus directly.
// The new flow: XState actor dc.onmessage -> RTC_SERVER_MESSAGE_RECEIVED event to machine -> App.tsx useEffect calls useHandleServerEvent.
// So, this function as defined here might become largely unused if App.tsx's useHandleServerEvent is comprehensive.
// For now, keeping it but noting its diminished role in the new architecture.
const createServerEventHandler = (eventBus: ReturnType<typeof useEventBus>) => {
  return (serverMessage: any) => {
    eventBus.emit(KatoEvents.SERVER_MESSAGE_RECEIVED, serverMessage);

    if (serverMessage.type === "session.status.updated") {
      eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, serverMessage.status as SessionStatus);
    } else if (serverMessage.type === "session.created") {
      if (serverMessage.session?.id) {
        eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, "CONNECTED");
      }
    } else if (serverMessage.type === "conversation.item.created") {
      if (serverMessage.item && serverMessage.item.role && serverMessage.item.content) {
        let textContent = "";
        if (Array.isArray(serverMessage.item.content) && serverMessage.item.content[0]?.type === "output_text") {
          textContent = serverMessage.item.content[0].text;
        } else if (typeof serverMessage.item.content === "string") {
          textContent = serverMessage.item.content;
        }
        if (textContent) {
          const transcriptDataForEvent = {
            serverId: serverMessage.item.id,
            idToAssign: serverMessage.item.id || uuidv4().slice(0, 32),
            role: serverMessage.item.role,
            title: textContent,
            status: serverMessage.item.status || (serverMessage.item.role === "assistant" ? "IN_PROGRESS" : "COMPLETE"),
            isLocal: false,
            timestamp: serverMessage.item.timestamp || new Date().toISOString(),
          };
          eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM, transcriptDataForEvent);
        }
      }
    } else if (serverMessage.type === "output_audio_buffer.started") {
      eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, true);
      console.log("[KatoRTCContext] Emitted KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED with isActive: true (from .started event)");
      eventBus.emit(KatoEvents.SERVER_OUTPUT_AUDIO_STARTED);
    } else if (serverMessage.type === "output_audio_buffer.stopped") {
      eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, false);
      console.log("[KatoRTCContext] Emitted KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED with isActive: false (from .stopped event)");
      eventBus.emit(KatoEvents.SERVER_OUTPUT_AUDIO_ENDED);
    } else if (serverMessage.type === "response.cancelled") {
      eventBus.emit(KatoEvents.SERVER_AGENT_RESPONSE_CANCELLED);
    } else if (serverMessage.type === "session.updated") {
      eventBus.emit(KatoEvents.SERVER_SESSION_UPDATED_ACK);
      if (serverMessage.session?.status) {
        eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, serverMessage.session.status as SessionStatus);
      }
    } else if (serverMessage.type === "input_audio_buffer.speech_started") {
      eventBus.emit(KatoEvents.USER_SPEECH_STARTED);
    } else if (serverMessage.type === "input_audio_buffer.speech_stopped") {
      eventBus.emit(KatoEvents.USER_SPEECH_STOPPED);
    } else if (serverMessage.type === "response.done") {
      eventBus.emit(KatoEvents.AGENT_RESPONSE_COMPLETED);
    }
  };
};


interface KatoRTCContextType {
  sessionStatus: SessionStatus;
  dcRef: React.MutableRefObject<RTCDataChannel | null>; // This will be a challenge as XState owns dc.
  // manualDisconnect: boolean; // Removed
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  connectKatoRTC: () => void;
  disconnectKatoRTC: (data?: {isSwitchingAgent?: boolean}) => void;
}

const KatoRTCContext = createContext<KatoRTCContextType | undefined>(undefined);

export const KatoRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus();
  const agentLifecycle = useAgentLifecycle(); // Use XState hook

  // Get values from XState machine context
  const xstateSessionStatus = agentLifecycle.state.context.sessionStatus;
  const xstateDc = agentLifecycle.state.context.dc;

  // Reconcile dcRef for context consumers. This is tricky because dc is not a RefObject here.
  // For now, create a local ref that tries to mirror xstateDc. Consumers might need adjustment.
  const localDcRef = useRef<RTCDataChannel | null>(null);
  useEffect(() => {
    localDcRef.current = xstateDc || null;
  }, [xstateDc]);

  // Local state for isAudioPlaybackEnabled, as before. Syncing with machine is a separate step.
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(true);
  // const urlCodec = "opus"; // No longer directly used to instantiate useKatoRTC hook here

  // const handleServerEvent = useCallback(createServerEventHandler(eventBus), [eventBus]); // No longer passed to a local hook call

  // The call to useOriginalKatoRTCHook is removed.
  // const { sessionStatus, dcRef, manualDisconnect } = useOriginalKatoRTCHook(...);

  const connectKatoRTC = useCallback(() => {
    console.log("[KatoRTCContext] connectKatoRTC called, sending RETRY to XState machine");
    // This assumes an agent is already selected or machine handles RETRY from idle appropriately.
    // If an agent needs to be explicitly selected first, this logic might need more context.
    agentLifecycle.send({ type: 'RETRY' }); 
  }, [agentLifecycle]);

  const disconnectKatoRTC = useCallback((data?: {isSwitchingAgent?: boolean}) => {
    console.log("[KatoRTCContext] disconnectKatoRTC called, sending USER_REQUESTED_DISCONNECT to XState machine");
    // The isSwitchingAgent payload from original call is not directly used when sending USER_REQUESTED_DISCONNECT.
    // The machine handles switches based on SELECT_AGENT event leading to its internal disconnect/connect flow.
    agentLifecycle.send({ type: 'USER_REQUESTED_DISCONNECT' });
  }, [agentLifecycle]);
  
  useEffect(() => {
    const handler = (enabled: boolean) => setIsAudioPlaybackEnabled(enabled);
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handler);
    return () => sub();
  }, [eventBus]);

  return (
    <KatoRTCContext.Provider value={{
      sessionStatus: xstateSessionStatus as SessionStatus, // Cast if XState status is slightly different but compatible
      dcRef: localDcRef, // Provide the local ref that mirrors XState's dc
      // manualDisconnect, // Removed
      isAudioPlaybackEnabled,
      setIsAudioPlaybackEnabled: (valueOrFn) => {
          const newValue = typeof valueOrFn === 'function' 
            ? (valueOrFn as (prevState: boolean) => boolean)(isAudioPlaybackEnabled) 
            : valueOrFn;
          console.log("[KatoRTCContext] setIsAudioPlaybackEnabled called with value:", newValue);
          eventBus.emit(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, newValue);
          // Consider sending an event to XState machine here if it needs to know about this change.
          // agentLifecycle.send({ type: 'SET_AUDIO_PLAYBACK_ENABLED', enabled: newValue });
      },
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

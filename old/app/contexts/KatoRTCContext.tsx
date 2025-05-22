"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SessionStatus, AgentConfig } from '@/app/types'; // Added AgentConfig for useIntroAudio dep
import { useKatoRTC as useOriginalKatoRTCHook } from '@/app/hooks/useKatoRTC';
import { useEventBus } from './EventBusContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { v4 as uuidv4 } from "uuid"; // For createServerEventHandler

// Add new KatoEvents (assuming they would be defined in KatoEvents.ts)
// For the purpose of this edit, we'll just use string literals directly
// but in a real scenario, these should be added to the KatoEvents enum/object
const USER_SPEECH_STARTED_EVENT = 'USER_SPEECH_STARTED';
const USER_SPEECH_STOPPED_EVENT = 'USER_SPEECH_STOPPED';
const AGENT_RESPONSE_COMPLETED_EVENT = 'AGENT_RESPONSE_COMPLETED';

// Define the server event handler function (similar to what was in page.tsx)
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
  dcRef: React.MutableRefObject<RTCDataChannel | null>;
  manualDisconnect: boolean;
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  connectKatoRTC: () => void;
  disconnectKatoRTC: (data?: {isSwitchingAgent?: boolean}) => void;
  // To be added: currentAgentConfig for useIntroAudio dependency if not available elsewhere
}

const KatoRTCContext = createContext<KatoRTCContextType | undefined>(undefined);

export const KatoRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus();
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(true);
  const urlCodec = "opus"; // Or from env/config

  // Memoize handleServerEvent based on eventBus
  const handleServerEvent = useCallback(createServerEventHandler(eventBus), [eventBus]);

  const { sessionStatus, dcRef, manualDisconnect } = useOriginalKatoRTCHook({
    isAudioPlaybackEnabled,
    urlCodec,
    handleServerEvent,
  });

  const connectKatoRTC = useCallback(() => {
    // The actual connection logic is initiated by useKatoRTC via event bus events.
    // This function is a placeholder if direct invocation is needed,
    // but primarily, connection is triggered by USER_REQUESTED_CONNECT.
    // We ensure the event is emitted.
    console.log("[KatoRTCContext] connectKatoRTC called, emitting USER_REQUESTED_CONNECT");
    eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
  }, [eventBus]);

  const disconnectKatoRTC = useCallback((data?: {isSwitchingAgent?: boolean}) => {
    console.log("[KatoRTCContext] disconnectKatoRTC called, emitting USER_REQUESTED_DISCONNECT");
    eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, data);
  }, [eventBus]);
  
  // Effect to tie local isAudioPlaybackEnabled state to the event bus system
  useEffect(() => {
    const handler = (enabled: boolean) => setIsAudioPlaybackEnabled(enabled);
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handler);
    return () => sub();
  }, [eventBus]);


  return (
    <KatoRTCContext.Provider value={{
      sessionStatus,
      dcRef,
      manualDisconnect,
      isAudioPlaybackEnabled,
      setIsAudioPlaybackEnabled: (valueOrFn) => {
          // When setIsAudioPlaybackEnabled is called, also emit an event
          // so other parts of the system (like page UI) can react if needed,
          // and the state in useKatoRTC is updated via its own subscription.
          const newValue = typeof valueOrFn === 'function' 
            ? (valueOrFn as (prevState: boolean) => boolean)(isAudioPlaybackEnabled) 
            : valueOrFn;
          eventBus.emit(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, newValue);
          // The local state will update via the useEffect subscription above.
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

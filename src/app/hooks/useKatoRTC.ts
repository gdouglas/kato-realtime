"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionStatus } from '@/app/types';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { useEvent } from '@/app/contexts/EventContext';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { createRealtimeConnection } from '@/app/lib/realtimeConnection';
import { KatoEvents } from '@/app/cases/kato/KatoEvents'; // Re-affirming the import

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface UseKatoRTCProps {
  isAudioPlaybackEnabled: boolean;
  urlCodec: string;
  // This implies createServerEventHandler would also need to be accessible or part of this hook's scope
  handleServerEvent: (serverMessage: any) => void; 
}

export function useKatoRTC({
  isAudioPlaybackEnabled,
  urlCodec,
  handleServerEvent,
}: UseKatoRTCProps) {
  const eventBus = useEventBus();
  const { logClientEvent, logServerEvent } = useEvent();
  const { addTranscriptBreadcrumb } = useTranscript();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null); // Required by createRealtimeConnection

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const [manualDisconnect, setManualDisconnect] = useState<boolean>(false);

  const performConnection = useCallback(async () => {
    if (sessionStatus === "CONNECTING" || sessionStatus === "CONNECTED") {
      console.warn("[PerformConnectionDebug][Hook] Connection attempt aborted, already connecting/connected.");
      return;
    }

    eventBus.emit(KatoEvents.SESSION_STATUS_WILL_CHANGE, "CONNECTING");
    eventBus.emit(KatoEvents.CONNECTION_ATTEMPT_STARTED);
    setManualDisconnect(false);
    addTranscriptBreadcrumb("Connecting to Realtime...");

    try {
      logClientEvent({ url: "/session" }, "fetch_session_token_request");
      const tokenResponse = await fetch(`${API_BASE_URL}/api/v1/session`, { method: "POST" });
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[PerformConnectionDebug][Hook] Token fetch failed:", errorText);
        throw new Error(`Token fetch failed: ${tokenResponse.status} ${errorText}`);
      }
      const data = await tokenResponse.json();
      logServerEvent(data, "fetch_session_token_response");

      if (!data.client_secret?.value) {
        console.error("[PerformConnectionDebug][Hook] No client_secret.value in token response.");
        throw new Error("No ephemeral key provided by the server");
      }
      const EPHEMERAL_KEY = data.client_secret.value;

      if (!audioElementRef.current) audioElementRef.current = document.createElement("audio");
      audioElementRef.current.autoplay = isAudioPlaybackEnabled;

      try {
        const { pc, dc } = await createRealtimeConnection(EPHEMERAL_KEY, audioElementRef, urlCodec);
        pcRef.current = pc;
        dcRef.current = dc;
        // setDataChannel(dc); // Not setting state here, dcRef.current is the source of truth

        dc.onopen = () => {
          logClientEvent({}, "data_channel.open");
          eventBus.emit(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, 'open');
          eventBus.emit(KatoEvents.CONNECTION_ESTABLISHED);
        };
        dc.onclose = () => {
          logClientEvent({}, "data_channel.close");
          eventBus.emit(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, 'closed');
        };
        dc.onerror = (errEvent: RTCErrorEvent) => {
          console.error("[PerformConnectionDebug][Hook] DataChannel: onerror fired.", errEvent);
          logClientEvent({ error: errEvent }, "data_channel.error");
          eventBus.emit(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, 'error');
        };
        dc.onmessage = (e: MessageEvent) => {
          handleServerEvent(JSON.parse(e.data));
        };
      } catch (rtcError: any) {
        console.error("[PerformConnectionDebug][Hook] Error directly from createRealtimeConnection or its immediate aftermath:", rtcError);
        if (rtcError.name === 'NotAllowedError') {
          console.log("[PerformConnectionDebug][Hook] Microphone permission denied during getUserMedia. Switching to text mode.");
          addTranscriptBreadcrumb("Microphone access denied. Switched to text input mode.");
          eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text');
          eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, 'no_mic');
          // setShowMicDeniedModal(true); // This state would need to be managed by the component or another hook
          eventBus.emit("SHOW_MIC_DENIED_MODAL_REQUESTED"); // Emit an event instead
        }
        throw rtcError;
      }
    } catch (error: any) {
      console.error("[PerformConnectionDebug][Hook] Error during connection process:", error);
      if (error.name === 'NotAllowedError') {
         // Fallback if not caught by inner
         console.log("[PerformConnectionDebug][Hook] (Outer Catch) Microphone permission denied. Switching to text mode.");
         addTranscriptBreadcrumb("Microphone access denied. Switched to text input mode.");
         eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text');
         eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, 'no_mic');
         // setShowMicDeniedModal(true);
         eventBus.emit("SHOW_MIC_DENIED_MODAL_REQUESTED");
      }
      eventBus.emit(KatoEvents.CONNECTION_FAILED, error);
    }
  }, [
    sessionStatus, eventBus, addTranscriptBreadcrumb, logClientEvent, logServerEvent, 
    isAudioPlaybackEnabled, urlCodec, handleServerEvent
  ]);

  const performDisconnection = useCallback((payload?: {isSwitchingAgent?: boolean}) => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(sender => sender.track?.stop());
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.onopen = null;
      dcRef.current.onclose = null;
      dcRef.current.onerror = null;
      dcRef.current.onmessage = null;
      // dcRef.current.close(); // Usually closed by pc.close()
      dcRef.current = null;
    }
    // setDataChannel(null); // Not setting state

    if (!payload?.isSwitchingAgent) {
      setManualDisconnect(true);
    }
    // setIsPTTUserSpeaking(false); // This state is outside this hook
    logClientEvent({}, "disconnected");
    addTranscriptBreadcrumb("Disconnected from Realtime.");
    eventBus.emit(KatoEvents.SESSION_STATUS_CHANGED, "DISCONNECTED");
    eventBus.emit(KatoEvents.DISCONNECT_COMPLETED);
  }, [eventBus, logClientEvent, addTranscriptBreadcrumb]);

  // Effect to subscribe to connect/disconnect requests from the event bus
  useEffect(() => {
    const unsubConnect = eventBus.on(KatoEvents.USER_REQUESTED_CONNECT, performConnection);
    const unsubDisconnect = eventBus.on(KatoEvents.USER_REQUESTED_DISCONNECT, performDisconnection);
    
    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, [eventBus, performConnection, performDisconnection]);
  
  // Effect to update local sessionStatus based on bus events
   useEffect(() => {
    const handleWillChange = (newStatus: SessionStatus) => setSessionStatus(newStatus); // Or just use what server sends.
    const handleChange = (newStatus: SessionStatus) => {
        setSessionStatus(newStatus); 
        // if (newStatus === "DISCONNECTED" || newStatus === "ERROR") {
        //     hasDoneInitialAgentSetupRef.current = false; // This logic is outside this hook
        // }
    };
    const sub1 = eventBus.on(KatoEvents.SESSION_STATUS_WILL_CHANGE, handleWillChange);
    const sub2 = eventBus.on(KatoEvents.SESSION_STATUS_CHANGED, handleChange);
    const sub3 = eventBus.on(KatoEvents.SERVER_SESSION_STATUS_UPDATE, handleChange); 

    return () => { sub1(); sub2(); sub3(); };
  }, [eventBus]);


  return {
    sessionStatus,
    dcRef, // Expose dcRef for sending messages
    manualDisconnect, // EXPOSE manualDisconnect
    // Connect/disconnect are now handled via events
  };
} 
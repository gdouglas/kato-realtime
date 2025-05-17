"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { AgentConfig, SessionStatus } from '@/app/types';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface UseIntroAudioProps {
  addTranscriptBreadcrumb: (message: string) => void;
  sessionStatus: SessionStatus;
  manualDisconnect: boolean;
  currentAgentConfig: AgentConfig | null; // Pass current agent directly
}

// No longer need KatoAppEvents here as POTENTIAL_INTRO_FLOW_START is removed

export function useIntroAudio({
  addTranscriptBreadcrumb,
  sessionStatus,
  manualDisconnect,
  currentAgentConfig, // Receive currentAgentConfig as a prop
}: UseIntroAudioProps) {
  const eventBus = useEventBus();
  const [isIntroAudioPlaying, setIsIntroAudioPlaying] = useState<boolean>(false);
  const introAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const playedIntroForAgentsRef = useRef(new Set<string>());
  // currentAgentForIntro is used to track the agent whose intro is *currently* being processed by playIntroAudio
  const [agentWhoseIntroIsProcessing, setAgentWhoseIntroIsProcessing] = useState<AgentConfig | null>(null);
  // const [audioUrlForModalRetry, setAudioUrlForModalRetry] = useState<string | null>(null); // Kept for modal logic if needed

  const playIntroAudio = useCallback(async (agentConfig: AgentConfig) => {
    if (!agentConfig.introAudio?.text || !agentConfig.name) {
      console.warn("[useIntroAudio] Agent config missing intro text or name. Skipping intro.", agentConfig);
      eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      return;
    }
    
    const agentName = agentConfig.name;
    setIsIntroAudioPlaying(true);
    setAgentWhoseIntroIsProcessing(agentConfig); 
    addTranscriptBreadcrumb("Preparing introductory message...");

    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'denied') {
        addTranscriptBreadcrumb("Microphone permission denied. Switched to text input mode.");
        eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text');
        eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, 'no_mic');
        eventBus.emit(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED);
        playedIntroForAgentsRef.current.add(agentName);
        setIsIntroAudioPlaying(false);
        setAgentWhoseIntroIsProcessing(null);
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
        return;
      }

      addTranscriptBreadcrumb("Fetching introductory audio...");
      const response = await fetch(`${API_BASE_URL}/api/v1/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              input: agentConfig.introAudio.text,
              model: agentConfig.introAudio.model || "gpt-4o-mini-tts",
              voice: agentConfig.introAudio.voice || "shimmer",
              instructions: agentConfig.introAudio.instructions,
          }),
      });

      if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to fetch introductory audio: ${response.status} ${errorData}`);
      }
      const newAudioBlob = await response.blob();
      const newAudioUrl = URL.createObjectURL(newAudioBlob);

      if (!introAudioElementRef.current) {
        introAudioElementRef.current = new Audio();
      }
      const audio = introAudioElementRef.current;
      audio.src = newAudioUrl;

      audio.onended = () => {
        setIsIntroAudioPlaying(false);
        setAgentWhoseIntroIsProcessing(null);
        URL.revokeObjectURL(newAudioUrl);
        if (agentName) playedIntroForAgentsRef.current.add(agentName);
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      };

      audio.onerror = (e) => {
        setIsIntroAudioPlaying(false);
        setAgentWhoseIntroIsProcessing(null);
        URL.revokeObjectURL(newAudioUrl);
        addTranscriptBreadcrumb("Error during intro playback. Connecting directly.");
        if (agentName) playedIntroForAgentsRef.current.add(agentName); 
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      };
      
      await audio.play();
      addTranscriptBreadcrumb("Introductory message playing.");

    } catch (error: any) {
      setIsIntroAudioPlaying(false);
      setAgentWhoseIntroIsProcessing(null);
      if (agentName) playedIntroForAgentsRef.current.add(agentName); 

      if (error.name === "NotAllowedError" || error.message.includes("user interaction")) {
          addTranscriptBreadcrumb("Audio playback requires user interaction.");
          // setAudioUrlForModalRetry(null); 
          eventBus.emit(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, true); 
      } else {
          addTranscriptBreadcrumb(`Error with intro: ${error.message}. Connecting directly.`);
          eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      }
    }
  }, [eventBus, addTranscriptBreadcrumb]); // Removed internal state dependencies that are now part of flow

  // Effect to decide whether to play intro or connect when agent/status changes
  useEffect(() => {
    console.log("[useIntroAudio] Evaluating agent/status for intro:", {
      agent: currentAgentConfig?.name,
      status: sessionStatus,
      manualDisconnect,
      isIntroPlaying: isIntroAudioPlaying,
      playedSet: Array.from(playedIntroForAgentsRef.current)
    });

    if (currentAgentConfig && sessionStatus === "DISCONNECTED" && !manualDisconnect && !isIntroAudioPlaying) {
      const agentName = currentAgentConfig.name;
      if (currentAgentConfig.introAudio?.text && !playedIntroForAgentsRef.current.has(agentName)) {
        console.log(`[useIntroAudio] Conditions met for agent ${agentName}. Playing intro.`);
        playIntroAudio(currentAgentConfig);
      } else {
        if (!currentAgentConfig.introAudio?.text) {
          console.log(`[useIntroAudio] No intro text for ${agentName}. Connecting directly.`);
        } else if (playedIntroForAgentsRef.current.has(agentName)) {
          console.log(`[useIntroAudio] Intro already played for ${agentName}. Connecting directly.`);
        }
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      }
    }
  }, [currentAgentConfig, sessionStatus, manualDisconnect, playIntroAudio, eventBus, isIntroAudioPlaying]); // Added isIntroAudioPlaying to prevent re-trigger if it's already trying to play
  
  // Handle modal confirmation
  useEffect(() => {
    const handleModalConfirmation = () => {
      console.log("[useIntroAudio] User confirmed audio modal.");
      if (agentWhoseIntroIsProcessing) { 
         addTranscriptBreadcrumb("Modal confirmed. Proceeding to connect.");
         playedIntroForAgentsRef.current.add(agentWhoseIntroIsProcessing.name); 
         setAgentWhoseIntroIsProcessing(null);
      } // else, it was a generic modal, not related to a blocked intro
      eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
    };
    const unsubscribeModalConfirm = eventBus.on(KatoEvents.USER_CONFIRMED_AUDIO_MODAL, handleModalConfirmation);

    return () => {
      unsubscribeModalConfirm();
      if (introAudioElementRef.current) {
        introAudioElementRef.current.onended = null;
        introAudioElementRef.current.onerror = null;
        introAudioElementRef.current.pause();
        introAudioElementRef.current.src = ""; 
      }
    };
  }, [eventBus, addTranscriptBreadcrumb, agentWhoseIntroIsProcessing]); // agentWhoseIntroIsProcessing is key here

  // Stop intro if agent changes while playing
  useEffect(() => {
    // This effect listens to currentAgentConfig prop directly. 
    // No need to subscribe to CURRENT_AGENT_CHANGED event from bus if prop is reliable.
    if (isIntroAudioPlaying && agentWhoseIntroIsProcessing && currentAgentConfig?.name !== agentWhoseIntroIsProcessing.name) {
        console.log(`[useIntroAudio] Agent prop changed from ${agentWhoseIntroIsProcessing.name} to ${currentAgentConfig?.name} while intro was playing. Stopping intro.`);
        if (introAudioElementRef.current) {
            introAudioElementRef.current.pause();
            introAudioElementRef.current.onended = null; 
            introAudioElementRef.current.onerror = null;
            introAudioElementRef.current.src = ""; // Release audio source
        }
        setIsIntroAudioPlaying(false);
        // Don't add to playedIntroForAgentsRef here, as it didn't complete for the original agent.
        setAgentWhoseIntroIsProcessing(null); 
        // The main useEffect (listening to currentAgentConfig, sessionStatus) will decide the next step for the new agent.
    }
  }, [currentAgentConfig, isIntroAudioPlaying, agentWhoseIntroIsProcessing]);


  return {
    isIntroAudioPlaying,
  };
} 
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { AgentConfig } from '@/app/types';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface UseIntroAudioProps {
  addTranscriptBreadcrumb: (message: string) => void;
}

export function useIntroAudio({
  addTranscriptBreadcrumb,
}: UseIntroAudioProps) {
  const eventBus = useEventBus();
  const [isIntroAudioPlaying, setIsIntroAudioPlaying] = useState<boolean>(false);
  const introAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const [currentlyPlayingIntroForAgent, setCurrentlyPlayingIntroForAgent] = useState<string | null>(null);

  const playIntroAudioInternal = useCallback(async (agentConfig: AgentConfig) => {
    if (!agentConfig.introAudio?.text || !agentConfig.name) {
      console.warn("[useIntroAudio] playIntroAudioInternal: Agent config missing intro text or name. Skipping intro.", agentConfig);
      eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
        agentName: agentConfig.name || "unknown", 
        playedSuccessfully: false, 
        error: "Missing intro text or agent name"
      });
      return;
    }
    
    const agentName = agentConfig.name;
    console.log(`[useIntroAudio] playIntroAudioInternal: Called for agent: ${agentName}`);
    setIsIntroAudioPlaying(true);
    setCurrentlyPlayingIntroForAgent(agentName);
    addTranscriptBreadcrumb(`Preparing intro for ${agentName}...`);

    try {
      console.log("[useIntroAudio] playIntroAudioInternal: Checking microphone permissions.");
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log(`[useIntroAudio] playIntroAudioInternal: Microphone permission state: ${permissionStatus.state}`);
      if (permissionStatus.state === 'denied') {
        addTranscriptBreadcrumb("Microphone permission denied for intro playback.");
        eventBus.emit(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED);
        setIsIntroAudioPlaying(false);
        setCurrentlyPlayingIntroForAgent(null);
        eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
          agentName, 
          playedSuccessfully: false, 
          error: "Microphone permission denied"
        });
        return;
      }

      addTranscriptBreadcrumb(`Fetching intro audio for ${agentName}...`);
      console.log(`[useIntroAudio] playIntroAudioInternal: Fetching audio for '${agentConfig.introAudio.text.substring(0,30)}...'`);
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
        console.log(`[useIntroAudio] playIntroAudioInternal: Intro audio ONENDED for agent: ${agentName}`);
        setIsIntroAudioPlaying(false);
        setCurrentlyPlayingIntroForAgent(null);
        URL.revokeObjectURL(newAudioUrl);
        eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { agentName, playedSuccessfully: true });
      };

      audio.onerror = (e) => {
        console.error(`[useIntroAudio] playIntroAudioInternal: Intro audio ONERROR for agent: ${agentName}`, e);
        setIsIntroAudioPlaying(false);
        setCurrentlyPlayingIntroForAgent(null);
        URL.revokeObjectURL(newAudioUrl);
        addTranscriptBreadcrumb(`Error during intro playback for ${agentName}.`);
        eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
          agentName, 
          playedSuccessfully: false, 
          error: e instanceof ErrorEvent ? e.message : "Audio playback error" 
        });
      };
      
      console.log(`[useIntroAudio] playIntroAudioInternal: Attempting to play audio for agent: ${agentName}`);
      await audio.play();
      console.log(`[useIntroAudio] playIntroAudioInternal: Audio playback started for agent: ${agentName}`);
      addTranscriptBreadcrumb(`Playing intro for ${agentName}.`);

    } catch (error: any) {
      console.error(`[useIntroAudio] playIntroAudioInternal: CATCH block error for agent ${agentName}:`, error);
      setIsIntroAudioPlaying(false);
      setCurrentlyPlayingIntroForAgent(null);

      if (error.name === "NotAllowedError" || error.message.includes("user interaction")) {
          addTranscriptBreadcrumb("Audio playback for intro requires user interaction.");
          console.log("[useIntroAudio] playIntroAudioInternal: NotAllowedError, emitting AUDIO_MODAL_VISIBILITY_CHANGED(true).");
          eventBus.emit(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, true); 
          eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
            agentName, 
            playedSuccessfully: false, 
            error: "Playback requires user interaction (NotAllowedError)"
          });
      } else {
          addTranscriptBreadcrumb(`Error with intro for ${agentName}: ${error.message}.`);
          eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
            agentName, 
            playedSuccessfully: false, 
            error: error.message 
          });
      }
    }
  }, [eventBus, addTranscriptBreadcrumb]);

  useEffect(() => {
    const handlePlayRequest = (data: { agentConfig: AgentConfig }) => {
      if (data.agentConfig) {
        console.log(`[useIntroAudio] Received PLAY_AGENT_INTRO_REQUESTED for ${data.agentConfig.name}`);
        if (isIntroAudioPlaying) {
            console.warn(`[useIntroAudio] Requested to play intro for ${data.agentConfig.name}, but intro for ${currentlyPlayingIntroForAgent} is already playing. Ignoring.`);
            eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
              agentName: data.agentConfig.name, 
              playedSuccessfully: false, 
              error: `Another intro was already playing for ${currentlyPlayingIntroForAgent}`
            });
            return;
        }
        playIntroAudioInternal(data.agentConfig);
      } else {
        console.warn("[useIntroAudio] PLAY_AGENT_INTRO_REQUESTED event received without agentConfig.");
      }
    };

    const unsubscribePlayRequest = eventBus.on(KatoEvents.PLAY_AGENT_INTRO_REQUESTED, handlePlayRequest);

    return () => {
      unsubscribePlayRequest();
      if (introAudioElementRef.current) {
        introAudioElementRef.current.onended = null;
        introAudioElementRef.current.onerror = null;
        if (!introAudioElementRef.current.paused) {
            introAudioElementRef.current.pause();
        }
        introAudioElementRef.current.src = ""; 
        URL.revokeObjectURL(introAudioElementRef.current.src);
      }
      if (isIntroAudioPlaying && currentlyPlayingIntroForAgent) {
        console.log(`[useIntroAudio] Unmounting while intro for ${currentlyPlayingIntroForAgent} was playing. Emitting completion as unsuccessful.`);
        eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, { 
            agentName: currentlyPlayingIntroForAgent, 
            playedSuccessfully: false, 
            error: "Component unmounted during intro playback"
        });
      }
    };
  }, [eventBus, playIntroAudioInternal, isIntroAudioPlaying, currentlyPlayingIntroForAgent]);

  return {
    isIntroAudioPlaying,
  };
} 
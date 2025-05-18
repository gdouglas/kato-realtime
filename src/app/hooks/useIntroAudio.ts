"use client";

import { useState, useEffect } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

interface UseIntroAudioProps {
  addTranscriptBreadcrumb: (message: string) => void;
}

export function useIntroAudio({
  addTranscriptBreadcrumb,
}: UseIntroAudioProps) {
  const eventBus = useEventBus();
  const [isIntroAudioPlaying, setIsIntroAudioPlaying] = useState<boolean>(false);

  useEffect(() => {
    const handlePlayRequest = (data: any) => {
      console.log(`[useIntroAudio] Event: PLAY_AGENT_INTRO_REQUESTED for ${data?.agentConfig?.name || 'unknown agent'}. Setting playing state to true.`);
      setIsIntroAudioPlaying(true);
    };

    const handlePlaybackCompleted = (data: any) => {
      console.log(`[useIntroAudio] Event: AGENT_INTRO_PLAYBACK_COMPLETED for ${data?.agentName || 'unknown agent'}. Success: ${data?.playedSuccessfully}. Setting playing state to false.`);
      setIsIntroAudioPlaying(false);
    };

    const unsubscribePlayRequest = eventBus.on(KatoEvents.PLAY_AGENT_INTRO_REQUESTED, handlePlayRequest);
    const unsubscribePlaybackCompleted = eventBus.on(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, handlePlaybackCompleted);

    return () => {
      unsubscribePlayRequest();
      unsubscribePlaybackCompleted();
      setIsIntroAudioPlaying(false);
    };
  }, [eventBus, addTranscriptBreadcrumb]);

  return {
    isIntroAudioPlaying,
  };
} 
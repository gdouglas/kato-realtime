"use client";

import React, { useRef, useEffect, useState } from 'react';
import { AgentLifecycleProvider } from '@/app/contexts/AgentLifecycleContext';
import { EventBusProvider } from '@/app/contexts/EventBusContext';
import { TranscriptProvider } from '@/app/contexts/TranscriptContext';
import { EventProvider } from '@/app/contexts/EventContext';
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const agentConfigsToUse = allAgentSets[defaultAgentSetKey];
  const urlCodec = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('codec') || 'opus') : 'opus';
  const isAudioPlaybackEnabled = true; // Example, can be made dynamic

  if (!isClient) {
    // Important: When returning null for SSR, ensure the parent layout.tsx still renders <html> and <body> tags
    // so the page structure is valid. Here, we return null, and layout.tsx will handle the html/body.
    // Alternatively, render a minimal placeholder, but ensure it doesn't break initial HTML structure.
    return null; 
  }

  return (
    <>
      <EventBusProvider>
        <TranscriptProvider>
          <EventProvider>
            <AgentLifecycleProvider
              agentConfigs={agentConfigsToUse}
              urlCodec={urlCodec}
              audioElement={audioRef.current}
              isAudioPlaybackEnabled={isAudioPlaybackEnabled}
            >
              {children}
            </AgentLifecycleProvider>
          </EventProvider>
        </TranscriptProvider>
      </EventBusProvider>
      <audio ref={audioRef} id="app-wide-audio-player" className="hidden" />
    </>
  );
} 
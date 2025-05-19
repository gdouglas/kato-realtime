"use client";

import React, { useRef, useEffect } from 'react';
import { EventBusProvider } from "@/app/contexts/EventBusContext";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import { KatoRTCProvider } from "@/app/contexts/KatoRTCContext";
import { AgentLifecycleProvider } from "@/app/contexts/AgentLifecycleContext";
import { AgentProvider } from "@/app/contexts/AgentContext";

export default function KatoCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Define props for AgentLifecycleProvider
  // These could come from environment variables, other contexts, or be constants
  const urlCodec = process.env.NEXT_PUBLIC_DEFAULT_CODEC || 'opus'; // Example
  const isAudioPlaybackEnabled = true; // Example default

  // Ensure the audio element is created and the ref is populated
  // The actual audioElement instance will be available after the first render.
  // The machine input accepts `null` initially.

  return (
    <EventBusProvider>
      <TranscriptProvider>
        <EventProvider>
          <AgentLifecycleProvider 
            urlCodec={urlCodec}
            audioElement={audioRef.current} // Pass the current value of the ref
            isAudioPlaybackEnabled={isAudioPlaybackEnabled}
            // agentConfigs can be omitted to use default, or passed explicitly if needed
          >
            <KatoRTCProvider>
              <AgentProvider>
                {children}
              </AgentProvider>
            </KatoRTCProvider>
          </AgentLifecycleProvider>
        </EventProvider>
        {/* Render the actual audio element, hidden or styled as needed */}
        <audio ref={audioRef} style={{ display: 'none' }} />
      </TranscriptProvider>
    </EventBusProvider>
  );
} 
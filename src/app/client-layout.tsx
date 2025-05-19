"use client";

import React, { useRef, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AgentLifecycleProvider } from '@/app/contexts/AgentLifecycleContext';
import { EventBusProvider } from '@/app/contexts/EventBusContext';
import { TranscriptProvider } from '@/app/contexts/TranscriptContext';
import { EventProvider } from '@/app/contexts/EventContext';
import { KatoRTCProvider } from '@/app/contexts/KatoRTCContext';
import { AgentProvider } from '@/app/contexts/AgentContext';
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import Image from "next/image";
import SettingsButton from "@/app/components/Settings/SettingsButton";
import SettingsModal from "@/app/components/Settings/SettingsModal";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const agentConfigsToUse = allAgentSets[defaultAgentSetKey];
  const urlCodec = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('codec') || 'opus') : 'opus';
  
  const isAudioPlaybackEnabled = pathname !== '/cases/kato/write';

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
              <KatoRTCProvider>
                <AgentProvider>
                  {/* Consistent Header */}
                  <header className="p-2 border-b flex justify-between items-center bg-white dark:bg-gray-900 shadow-sm">
                    <div className="flex items-center">
                      <Image 
                        src="/logos/UBC-crest-blue.png" 
                        alt="UBC Logo" 
                        width={40} 
                        height={40} 
                        className="mr-3 w-10 h-auto"
                      />
                      <span className="text-md font-semibold text-gray-800 dark:text-white ml-2">Mr Kato - Realtime Patient Simulator</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <SettingsButton />
                    </div>
                  </header>
                  {/* Page Content */}
                  {children}
                  {/* Settings Modal overlays all content */}
                  <SettingsModal />
                </AgentProvider>
              </KatoRTCProvider>
            </AgentLifecycleProvider>
          </EventProvider>
        </TranscriptProvider>
      </EventBusProvider>
      <audio ref={audioRef} id="app-wide-audio-player" className="hidden" />
    </>
  );
} 
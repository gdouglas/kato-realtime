"use client";

import React from 'react';
import { EventBusProvider } from "@/app/contexts/EventBusContext";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import { KatoRTCProvider } from "@/app/contexts/KatoRTCContext";
import { AgentProvider } from "@/app/contexts/AgentContext";

export default function KatoCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TranscriptProvider>
      <EventProvider>
        <EventBusProvider>
          <KatoRTCProvider>
            <AgentProvider>
              {children}
            </AgentProvider>
          </KatoRTCProvider>
        </EventBusProvider>
      </EventProvider>
    </TranscriptProvider>
  );
} 
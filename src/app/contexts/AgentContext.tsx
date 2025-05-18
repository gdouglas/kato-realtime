"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AgentConfig, SessionStatus } from '@/app/types';
import { useAgentManager as useOriginalAgentManagerHook } from '@/app/hooks/useAgentManager';
import { useEventBus } from './EventBusContext';
import { useTranscript } from './TranscriptContext'; // To get addTranscriptBreadcrumb
import { useKatoRTCContext } from './KatoRTCContext'; // To get sessionStatus
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking"; // Default agents

interface AgentContextType {
  agentConfigs: AgentConfig[];
  selectedAgentName: string;
  currentAgentConfig: AgentConfig | null;
  patientAgent: AgentConfig | null;
  preceptorAgent: AgentConfig | null;
  selectAgent: (agentName: string) => void;
  isSwitchingInProgress: boolean;
  // Add other exports from useAgentManager if needed by pages
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus();
  const { addTranscriptBreadcrumb } = useTranscript();
  const { sessionStatus } = useKatoRTCContext(); // Get sessionStatus from KatoRTCContext

  const {
    agentConfigs,
    selectedAgentName,
    currentAgentConfig,
    patientAgent: pa, // rename to avoid conflict in destructuring if needed
    preceptorAgent: pra, // rename
    isSwitchingInProgress, // Get from the hook
    // setSelectedAgentName, // Internal to the hook, exposed via selectAgent
  } = useOriginalAgentManagerHook({
    initialAgentConfigs: medicalHistoryTakingAgents,
    sessionStatus, // Pass sessionStatus from KatoRTCContext
    addTranscriptBreadcrumb,
  });

  // Function to allow components to request an agent change via the event bus
  const selectAgent = useCallback((agentName: string) => {
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName });
  }, [eventBus]);

  return (
    <AgentContext.Provider value={{
      agentConfigs,
      selectedAgentName,
      currentAgentConfig,
      patientAgent: pa || null, // Ensure null if undefined
      preceptorAgent: pra || null, // Ensure null if undefined
      selectAgent,
      isSwitchingInProgress, // Provide in context
    }}>
      {children}
    </AgentContext.Provider>
  );
};

export const useAgentContext = () => {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }
  return context;
}; 
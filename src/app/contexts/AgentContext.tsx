"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AgentConfig, SessionStatus } from '@/app/types';
import { useEventBus } from './EventBusContext';
import { useTranscript } from './TranscriptContext'; // To get addTranscriptBreadcrumb
// import { useKatoRTCContext } from './KatoRTCContext'; // No longer needed for sessionStatus
import { useAgentLifecycle } from './AgentLifecycleContext'; // Import to get sessionStatus and other lifecycle data
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
// import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking"; // No longer needed here

interface AgentContextType {
  agentConfigs: AgentConfig[];
  selectedAgentName: string | undefined; // Can be undefined from XState
  currentAgentConfig: AgentConfig | null | undefined; // Can be null or undefined from XState
  patientAgent: AgentConfig | null; // Placeholder - needs logic if used
  preceptorAgent: AgentConfig | null; // Placeholder - needs logic if used
  availableAgents: AgentConfig[];
  inactiveAgents: AgentConfig[];
  selectAgent: (agentName: string) => void;
  isSwitchingInProgress: boolean; 
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus(); // Still potentially useful for other things, or can be removed if not used by this context
  const { addTranscriptBreadcrumb } = useTranscript();
  const agentLifecycle = useAgentLifecycle();
  
  const { 
    agentConfigs: contextAgentConfigs, // Rename to avoid conflict in this scope
    selectedAgentName, 
    currentAgentConfig,
    sessionStatus
  } = agentLifecycle.state.context;
  const { isSwitchingInProgress } = agentLifecycle; 

  // Derive patientAgent and preceptorAgent from agentConfigs
  let patientAgent: AgentConfig | null = null;
  let preceptorAgent: AgentConfig | null = null;

  const resolvedAgentConfigs = contextAgentConfigs || []; // Ensure it's an array
  const availableAgents = resolvedAgentConfigs; // All resolved agents are "available"

  if (resolvedAgentConfigs.length > 0) {
    patientAgent = resolvedAgentConfigs.find(agent => agent.name === "mrKato") || null;
    preceptorAgent = resolvedAgentConfigs.find(agent => agent.name === "preceptor") || null;
  }

  const inactiveAgents = availableAgents.filter(
    agent => agent.name !== currentAgentConfig?.name
  );

  const selectAgent = useCallback((agentName: string) => {
    const currentMachineState = agentLifecycle.state;
    // Use sessionStatus from context for checks within agentActive state
    const currentSessionStatusFromContext = agentLifecycle.state.context.sessionStatus; 

    const canSelectNewAgent =
      currentMachineState.matches('idle') ||
      currentMachineState.matches('connectionError') ||
      currentMachineState.matches('errorIntroFailed') ||
      currentMachineState.matches('switchError') ||
      (currentMachineState.matches('agentActive') && 
        (currentSessionStatusFromContext === 'DISCONNECTED' || currentSessionStatusFromContext === 'ERROR')) ||
      currentMachineState.matches('activatingAgent') ||
      currentMachineState.matches('preparingToSwitch');

    if (currentMachineState.context.selectedAgentName !== agentName || canSelectNewAgent) {
      addTranscriptBreadcrumb(`[AgentContext] Selecting agent: ${agentName}. XState status: ${currentMachineState.value}`);
      console.log(`[AgentContext] Sending SELECT_AGENT event to XState machine for ${agentName}`);
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName });
    } else {
      addTranscriptBreadcrumb(`[AgentContext] Agent selection for ${agentName} ignored. XState machine is busy or agent already selected. State: ${currentMachineState.value}`);
    }
  }, [addTranscriptBreadcrumb, agentLifecycle]);

  return (
    <AgentContext.Provider value={{
      agentConfigs: resolvedAgentConfigs, // Use the resolved array
      selectedAgentName: selectedAgentName, 
      currentAgentConfig: currentAgentConfig, 
      patientAgent, 
      preceptorAgent, 
      availableAgents,
      inactiveAgents,
      selectAgent,
      isSwitchingInProgress, 
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
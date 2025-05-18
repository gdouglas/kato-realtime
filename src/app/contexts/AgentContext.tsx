"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AgentConfig, SessionStatus } from '@/app/types';
import { useAgentManager as useOriginalAgentManagerHook } from '@/app/hooks/useAgentManager';
import { useEventBus } from './EventBusContext';
import { useTranscript } from './TranscriptContext'; // To get addTranscriptBreadcrumb
// import { useKatoRTCContext } from './KatoRTCContext'; // No longer needed for sessionStatus
import { useAgentLifecycle } from './AgentLifecycleContext'; // Import to get sessionStatus and other lifecycle data
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking"; // Default agents

interface AgentContextType {
  agentConfigs: AgentConfig[];
  selectedAgentName: string;
  currentAgentConfig: AgentConfig | null;
  patientAgent: AgentConfig | null;
  preceptorAgent: AgentConfig | null;
  selectAgent: (agentName: string) => void; // This function is provided by AgentContext
  isSwitchingInProgress: boolean; // From useOriginalAgentManagerHook, but XState also has this
  // sessionStatus: SessionStatus; // Will get from useAgentLifecycle directly in components needing it
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const eventBus = useEventBus();
  const { addTranscriptBreadcrumb } = useTranscript();
  // const { sessionStatus: rtcSessionStatus } = useKatoRTCContext(); // Old way
  const agentLifecycle = useAgentLifecycle(); // Get the whole agent lifecycle context
  const { sessionStatus, state: agentLifecycleState, isSwitchingInProgress: xstateIsSwitchingInProgress } = agentLifecycle; // Destructure state and sessionStatus

  const {
    agentConfigs,
    selectedAgentName,
    currentAgentConfig,
    patientAgent: pa,
    preceptorAgent: pra,
    isSwitchingInProgress: useAgentManagerIsSwitchingInProgress, 
  } = useOriginalAgentManagerHook({
    initialAgentConfigs: medicalHistoryTakingAgents,
    sessionStatus: sessionStatus, 
    addTranscriptBreadcrumb,
  });

  // selectAgent function: This is a key function of AgentContext.
  // Currently, it emits to eventBus. USER_SELECTED_AGENT is listened to by useAgentManager.
  // This should eventually be replaced by components calling agentLifecycle.send({ type: 'SELECT_AGENT', ... }) directly.
  // For now, we keep it to minimize changes to consumers of AgentContext.
  const selectAgent = useCallback((agentName: string) => {
    const xstateCanAcceptSelection = 
        agentLifecycle.state.matches('idle') ||
        agentLifecycle.state.matches('connectionError') ||
        agentLifecycle.state.matches('errorIntroFailed') ||
        agentLifecycle.state.matches('switchError');

    // Condition: select if the agent is different OR if the machine is in a state that can accept a new selection.
    if (agentLifecycle.state.context.selectedAgentName !== agentName || xstateCanAcceptSelection) {
      addTranscriptBreadcrumb(`[AgentContext] Selecting agent: ${agentName}. XState status: ${agentLifecycle.state.value}`);
      
      // Send event directly to XState machine
      console.log(`[AgentContext] Sending SELECT_AGENT event to XState machine for ${agentName}`);
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName });

      // Keep emitting to eventBus for now, for any parts of useAgentManager that might still be relevant for UI state
      // This will allow useAgentManager to update its selectedAgentName, which the UI uses.
      // useAgentManager should NOT attempt to play intros or connect based on this anymore due to earlier changes.
      console.log(`[AgentContext] Emitting USER_SELECTED_AGENT to event bus for ${agentName} (for legacy useAgentManager parts).`);
      eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName }); 

    } else {
      addTranscriptBreadcrumb(`[AgentContext] Agent selection for ${agentName} ignored. XState machine is busy or agent already selected. State: ${agentLifecycle.state.value}`);
    }
  }, [eventBus, addTranscriptBreadcrumb, agentLifecycle]); // agentLifecycle.state is implicitly a dependency through agentLifecycle object

  // Combine switching status. Prefer XState's more detailed status if available.
  const effectiveIsSwitchingInProgress = xstateIsSwitchingInProgress || useAgentManagerIsSwitchingInProgress;

  return (
    <AgentContext.Provider value={{
      agentConfigs,
      selectedAgentName, 
      currentAgentConfig, 
      patientAgent: pa || null, 
      preceptorAgent: pra || null, 
      selectAgent,
      isSwitchingInProgress: effectiveIsSwitchingInProgress, 
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
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { AgentConfig, SessionStatus } from '@/app/types';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

interface UseAgentManagerProps {
  initialAgentConfigs: AgentConfig[];
  sessionStatus: SessionStatus;
  addTranscriptBreadcrumb: (message: string) => void;
}

export function useAgentManager({
  initialAgentConfigs,
  sessionStatus,
  addTranscriptBreadcrumb,
}: UseAgentManagerProps) {
  const eventBus = useEventBus();

  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(initialAgentConfigs);
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [currentAgentConfig, setCurrentAgentConfig] = useState<AgentConfig | null>(null);

  useEffect(() => {
    // Initialize agentConfigs if initialAgentConfigs changes (e.g., loaded async, though not current case)
    setAgentConfigs(initialAgentConfigs);
  }, [initialAgentConfigs]);

  const handleSelectAgent = useCallback((data: { agentName: string }) => {
    const newAgentName = data.agentName;
    if (!newAgentName) {
      console.warn("[useAgentManager] USER_SELECTED_AGENT event received with no agentName.");
      return;
    }

    const newAgentConfig = agentConfigs.find(a => a.name === newAgentName);

    if (!newAgentConfig) {
      console.error(`[useAgentManager] Agent configuration not found for name: ${newAgentName}`);
      return;
    }

    const oldAgentName = selectedAgentName;

    if (newAgentName !== oldAgentName) {
      addTranscriptBreadcrumb(`Selected agent: ${newAgentConfig.publicDescription || newAgentName}.`);
      setSelectedAgentName(newAgentName);
      setCurrentAgentConfig(newAgentConfig);
      
      eventBus.emit(KatoEvents.CURRENT_AGENT_CHANGED, { 
        newAgentName: newAgentName, 
        oldAgentName: oldAgentName || undefined, // Ensure oldAgentName is not empty string if it was initial
        agentConfig: newAgentConfig 
      });

      if ((sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") && oldAgentName) {
        addTranscriptBreadcrumb(`Switching agent. Disconnecting from ${oldAgentName}...`);
        eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, { isSwitchingAgent: true });
      }
    } else {
      // If the same agent is selected
      if (sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") {
        addTranscriptBreadcrumb(`Attempting to reconnect with ${newAgentName}...`);
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      } else if (sessionStatus === "CONNECTED") {
         addTranscriptBreadcrumb(`Already connected to ${newAgentName}.`);
      }
    }
  }, [agentConfigs, selectedAgentName, sessionStatus, eventBus, addTranscriptBreadcrumb]);

  useEffect(() => {
    const unsubSelect = eventBus.on(KatoEvents.USER_SELECTED_AGENT, handleSelectAgent);
    return () => {
      unsubSelect();
    };
  }, [eventBus, handleSelectAgent]);

  // Derived patient and preceptor agents
  const patientAgent = useMemo(() => agentConfigs.find(a => a.name === "mrKato"), [agentConfigs]);
  const preceptorAgent = useMemo(() => agentConfigs.find(a => a.name === "preceptor"), [agentConfigs]);

  return {
    agentConfigs,
    selectedAgentName,
    currentAgentConfig,
    patientAgent,
    preceptorAgent,
  };
} 
"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useMachine } from '@xstate/react';
import {
  agentLifecycleMachine,
  AgentLifecycleMachineContext as XStateContext,
  AgentLifecycleMachineEvent as XStateEvent,
  AgentLifecycleMachineInput
} from '@/app/machines/katoAgentLifecycleMachine'; 
import { ActorRefFrom, SnapshotFrom } from 'xstate';
import { AgentConfig } from '@/app/types';

// Import hooks for dependencies
import { useEventBus } from './EventBusContext';
import { useTranscript } from './TranscriptContext';
import { useEvent } from './EventContext';

// Import your agent configurations
// TODO: This should ideally be passed as a prop to the provider if it can vary,
// or sourced from a central config if static for this part of the app.
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

// Define the shape of the context data
interface AgentLifecycleContextType {
  state: SnapshotFrom<typeof agentLifecycleMachine>;
  send: ActorRefFrom<typeof agentLifecycleMachine>['send'];
  actorRef: ActorRefFrom<typeof agentLifecycleMachine>;
  // Helper getters for convenience, derived from machine state.context
  currentAgentConfig: AgentConfig | null | undefined;
  selectedAgentName: string | undefined;
  isSwitchingInProgress: boolean;
  isLoading: boolean; // Combines multiple loading-like states
  error: string | object | undefined;
  sessionStatus: XStateContext['sessionStatus'];
}

const AgentLifecycleContext = createContext<AgentLifecycleContextType | undefined>(undefined);

// Update Provider props to include all necessary inputs for the machine
export interface AgentLifecycleProviderProps {
  children: ReactNode;
  agentConfigs?: AgentConfig[];
  urlCodec: string;
  audioElement: HTMLAudioElement | null;
  isAudioPlaybackEnabled: boolean;
}

export const AgentLifecycleProvider: React.FC<AgentLifecycleProviderProps> = ({ 
  children, 
  agentConfigs,
  urlCodec,
  audioElement,
  isAudioPlaybackEnabled,
}) => {
  const initialConfigs = agentConfigs || medicalHistoryTakingAgents;

  // Get dependencies from other contexts
  const eventBus = useEventBus();
  const { addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const machineInput: AgentLifecycleMachineInput = {
    agentConfigs: initialConfigs,
    urlCodec,
    audioElement,
    eventBus,
    addTranscriptBreadcrumb,
    logClientEvent,
    logServerEvent,
    isAudioPlaybackEnabled,
  };

  const [state, send, actorRef] = useMachine(agentLifecycleMachine, {
    input: machineInput,
  });

  // Derived state for easier consumption by components
  const currentAgentConfig = state.context.currentAgentConfig;
  const selectedAgentName = state.context.selectedAgentName;
  const error = state.context.error;
  const sessionStatus = state.context.sessionStatus;

  // Determine if a switch is in progress based on machine states
  const isSwitchingInProgress = state.matches('preparingToSwitch') ||
                                state.matches('disconnectingForSwitch') ||
                                state.matches('activatingAgent') ||
                                state.matches('playingIntro') ||
                                state.matches('awaitingAudioModalConfirmation') ||
                                state.matches('connecting');

  const isLoading = state.matches('disconnectingForSwitch') || 
                    state.matches('playingIntro') || 
                    state.matches('connecting');

  return (
    <AgentLifecycleContext.Provider value={{
      state,
      send,
      actorRef,
      currentAgentConfig,
      selectedAgentName,
      isSwitchingInProgress,
      isLoading,
      error,
      sessionStatus,
    }}>
      {children}
    </AgentLifecycleContext.Provider>
  );
};

export const useAgentLifecycle = () => {
  const context = useContext(AgentLifecycleContext);
  if (context === undefined) {
    throw new Error('useAgentLifecycle must be used within an AgentLifecycleProvider');
  }
  return context;
};

import React from 'react';
import { AgentConfig } from '@/app/types';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

interface AgentSwitcherProps {
  currentAgentConfig: AgentConfig | null | undefined;
  patientAgent: AgentConfig | null | undefined;
  preceptorAgent: AgentConfig | null | undefined;
  disableAgentSwitchers: boolean;
  isIntroAudioPlaying: boolean;
  onSelectAgent: (agentName: string) => void;
}

const AgentSwitcher: React.FC<AgentSwitcherProps> = ({
  currentAgentConfig,
  patientAgent,
  preceptorAgent,
  disableAgentSwitchers,
  isIntroAudioPlaying,
  onSelectAgent,
}) => {
  const eventBus = useEventBus();

  const handleAgentSelect = (agentName: string) => {
    if (disableAgentSwitchers) return;
    
    console.log(`[AgentSwitcher] User selected agent: ${agentName}`);
    
    // Emit an event with the correct payload structure
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { 
      agentName: agentName
    });
    
    // Call the callback provided by the parent
    onSelectAgent(agentName);
  };

  return (
    <div className="agent-switcher-container bg-gray-100 dark:bg-neutral-800 absolute bottom-0 left-6 flex flex-col space-y-2 z-10">
      {currentAgentConfig?.name !== patientAgent?.name && patientAgent && (
        <div
          onClick={() => handleAgentSelect(patientAgent.name)}
          title={
            disableAgentSwitchers
              ? isIntroAudioPlaying
                ? "Agent intro playing..."
                : "Agent switch in progress..."
              : `Switch to ${patientAgent.publicDescription}`
          }
          className={`flex flex-col items-center text-center p-3 rounded-xl transition-all shadow-md hover:shadow-lg ${
            disableAgentSwitchers
              ? 'opacity-50 cursor-not-allowed bg-gray-200 dark:bg-neutral-700'
              : 'cursor-pointer bg-white dark:bg-neutral-700 hover:bg-green-50 dark:hover:bg-green-900'
          }`}
        >
          <div className="w-16 h-16 md:w-20 md:h-20 border-2 border-green-400 bg-green-50 dark:bg-green-800 dark:bg-opacity-30 rounded-full flex items-center justify-center text-green-600 dark:text-green-300 text-lg md:text-xl font-semibold">
            Patient
          </div>
          <span className="mt-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
            {patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}
          </span>
        </div>
      )}
      {currentAgentConfig?.name !== preceptorAgent?.name && preceptorAgent && (
        <div
          onClick={() => handleAgentSelect(preceptorAgent.name)}
          title={
            disableAgentSwitchers
              ? isIntroAudioPlaying
                ? "Agent intro playing..."
                : "Agent switch in progress..."
              : `Switch to ${preceptorAgent.publicDescription}`
          }
          className={`flex flex-col items-center text-center p-3 rounded-xl transition-all shadow-md hover:shadow-lg ${
            disableAgentSwitchers
              ? 'opacity-50 cursor-not-allowed bg-gray-200 dark:bg-neutral-700'
              : 'cursor-pointer bg-white dark:bg-neutral-700 hover:bg-purple-50 dark:hover:bg-purple-900'
          }`}
        >
          <div className="w-16 h-16 md:w-20 md:h-20 border-2 border-purple-400 bg-purple-50 dark:bg-purple-800 dark:bg-opacity-30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-300 text-sm md:text-base font-semibold">
            Preceptor
          </div>
          <span className="mt-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
            {preceptorAgent.name === "preceptor" ? "Stuck?" : preceptorAgent.name}
          </span>
        </div>
      )}
    </div>
  );
};

export default AgentSwitcher; 
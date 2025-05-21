import React from 'react';
import { SessionStatus, AgentConfig } from '@/app/types'; // Assuming SessionStatus and AgentConfig are exported

interface BottomBarProps {
  sessionStatus: SessionStatus;
  currentAgentConfig: AgentConfig | null | undefined; // Adjusted type
  isSwitchingInProgress: boolean;
  isIntroAudioPlaying: boolean;
  onToggleConnection: () => void;
  onNavigateToWrite: () => void;
  onCreateDDx: () => void;
}

const BottomBar: React.FC<BottomBarProps> = ({
  sessionStatus,
  currentAgentConfig,
  isSwitchingInProgress,
  isIntroAudioPlaying,
  onToggleConnection,
  onNavigateToWrite,
  onCreateDDx,
}) => {
  return (
    <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4 fixed bottom-0 left-0 right-0 shadow-md">
      <div></div> {/* Placeholder for left content if any */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onToggleConnection}
          className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors ${
            sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING"
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          } focus:outline-none focus:ring-2 disabled:opacity-50`}
          disabled={
            (!currentAgentConfig &&
              !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")) ||
            isSwitchingInProgress
          }
        >
          {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING"
            ? "Disconnect"
            : "Connect"}
        </button>
        <button
          onClick={onNavigateToWrite}
          className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 disabled:opacity-50"
          disabled={isSwitchingInProgress || isIntroAudioPlaying}
        >
          Write
        </button>
      </div>
      <div>
        <button
          onClick={onCreateDDx}
          className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 disabled:opacity-50"
          disabled={isSwitchingInProgress || isIntroAudioPlaying}
        >
          Create a DDx
        </button>
      </div>
    </div>
  );
};

export default BottomBar; 
import React from "react";
import { SessionStatus } from "@/app/types";

interface BottomToolbarProps {
  sessionStatus: SessionStatus;
  onToggleConnection: () => void;
  agentName: string;
  isAgentActive: boolean;
  isConnecting: boolean;
  isSwitching: boolean;
  isError: boolean;
  errorMessage: string;
  isOutputAudioBufferActive: boolean;
  audioInputMode: string;
  onAudioInputModeChange: (mode: string) => void;
  isMicAccessError: boolean;
}

function BottomToolbar({
  sessionStatus,
  onToggleConnection,
  agentName,
  isAgentActive,
  isConnecting,
  isSwitching,
  isError,
  errorMessage,
  isOutputAudioBufferActive,
  audioInputMode,
  onAudioInputModeChange,
  isMicAccessError,
}: BottomToolbarProps) {
  function getConnectionButtonLabel() {
    if (isAgentActive) return "Disconnect";
    if (isConnecting) return "Connecting...";
    if (isSwitching) return "Switching...";
    if (isError) return "Retry";
    return "Connect";
  }

  function getConnectionButtonClasses() {
    const baseClasses = "text-white text-base p-2 w-36 rounded-md h-full";
    let finalClasses = baseClasses;
    if (isConnecting || isSwitching) {
      finalClasses += " cursor-not-allowed bg-gray-500";
    } else if (isAgentActive) {
      finalClasses += " cursor-pointer bg-red-600 hover:bg-red-700";
    } else {
      finalClasses += " cursor-pointer bg-black hover:bg-gray-900";
    }
    return finalClasses;
  }

  return (
    <div className="p-4 flex flex-row items-center justify-center gap-x-4 sm:gap-x-6 md:gap-x-8 flex-wrap bg-gray-100 dark:bg-gray-800 border-t dark:border-gray-700">
      <button
        onClick={onToggleConnection}
        className={getConnectionButtonClasses()}
        disabled={isConnecting || isSwitching}
      >
        {getConnectionButtonLabel()}
      </button>

      <div className={`text-sm ${isError ? "text-red-500" : "text-gray-700 dark:text-gray-300"} min-w-[100px] text-center whitespace-nowrap`}>
        Status: {isError ? `Error` : sessionStatus}
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300 min-w-[100px] text-center whitespace-nowrap">
        Agent: {agentName}
      </div>
      
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Input: {audioInputMode} {isMicAccessError ? "(Mic Error ⚠️)" : ""}
      </div>
      <button 
        onClick={() => onAudioInputModeChange(audioInputMode === 'push_to_talk' ? 'continuous' : 'push_to_talk')}
        className={`p-2 border rounded text-sm ${isMicAccessError ? "border-red-500 text-red-500" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"}`} 
        title={isMicAccessError ? "Microphone access error!" : "Toggle input mode"}
      >
        Toggle Mic Mode
      </button>
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Audio Out: {isOutputAudioBufferActive ? "Playing" : "Idle"}
      </div>

      {isError && errorMessage && (
        <div className="w-full text-center text-red-500 text-xs pt-2">
          Details: {errorMessage}
        </div>
      )}
    </div>
  );
}

export default BottomToolbar;

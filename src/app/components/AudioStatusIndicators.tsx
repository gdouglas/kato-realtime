"use client";

import React from 'react';
import { useAgentLifecycle } from '@/app/contexts/AgentLifecycleContext';

interface AudioStatusIndicatorsProps {
  className?: string;
}

const AudioStatusIndicators: React.FC<AudioStatusIndicatorsProps> = ({ className = "" }) => {
  const agentLifecycle = useAgentLifecycle();
  
  // Get current settings from XState machine context
  const micEnabled = agentLifecycle.state.context.micEnabled ?? false;
  const audioOutputEnabled = agentLifecycle.state.context.audioOutputEnabled ?? false;
  const sessionStatus = agentLifecycle.state.context.sessionStatus;

  const isConnected = sessionStatus === 'CONNECTED';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Microphone Status */}
      <div 
        className="flex items-center gap-1 cursor-help" 
        title={`Microphone: ${micEnabled ? 'Enabled' : 'Disabled'}${!isConnected ? ' (Not connected)' : ''}`}
      >
        <div className={`w-3 h-3 rounded-full ${
          !isConnected ? 'bg-gray-400' : 
          micEnabled ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <svg 
          className={`w-4 h-4 ${
            !isConnected ? 'text-gray-400' : 
            micEnabled ? 'text-green-600' : 'text-red-500'
          }`} 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          {micEnabled ? (
            // Microphone icon
            <path d="M10 3a3 3 0 013 3v4a3 3 0 11-6 0V6a3 3 0 013-3z" />
          ) : (
            // Microphone off icon
            <>
              <path d="M10 3a3 3 0 013 3v4a3 3 0 11-6 0V6a3 3 0 013-3z" />
              <path d="M2 2l16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </>
          )}
          <path d="M5 10a5 5 0 0010 0v1a5 5 0 01-10 0v-1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 15v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Audio Output Status */}
      <div 
        className="flex items-center gap-1 cursor-help" 
        title={`Audio Output: ${audioOutputEnabled ? 'Enabled' : 'Disabled'}${!isConnected ? ' (Not connected)' : ''}`}
      >
        <div className={`w-3 h-3 rounded-full ${
          !isConnected ? 'bg-gray-400' : 
          audioOutputEnabled ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <svg 
          className={`w-4 h-4 ${
            !isConnected ? 'text-gray-400' : 
            audioOutputEnabled ? 'text-green-600' : 'text-red-500'
          }`} 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          {audioOutputEnabled ? (
            // Speaker icon
            <>
              <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.824L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.797-3.824z" />
              <path d="M13.293 5.293a1 1 0 011.414 1.414A4 4 0 0116 10a4 4 0 01-1.293 2.707 1 1 0 11-1.414-1.414A2 2 0 0014 10a2 2 0 00-.707-1.707z" />
            </>
          ) : (
            // Speaker off icon
            <>
              <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.824L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.797-3.824z" />
              <path d="M12 7l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </>
          )}
        </svg>
      </div>

      {/* Connection Status */}
      <div 
        className={`text-xs px-2 py-1 rounded cursor-help ${
          sessionStatus === 'CONNECTED' ? 'bg-green-100 text-green-800' :
          sessionStatus === 'CONNECTING' ? 'bg-yellow-100 text-yellow-800' :
          sessionStatus === 'ERROR' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-600'
        }`}
        title={`Connection Status: ${sessionStatus}`}
      >
        {sessionStatus === 'CONNECTED' ? 'Live' :
         sessionStatus === 'CONNECTING' ? 'Connecting...' :
         sessionStatus === 'ERROR' ? 'Error' :
         'Offline'}
      </div>
    </div>
  );
};

export default AudioStatusIndicators; 
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { WebRTCManager } from '../../lib/webrtcManager';
import { SessionStatus, TransitionStatus } from '../../types';

// Define agent configurations for testing
const AGENTS = {
  PRECEPTOR: {
    name: 'Preceptor',
    voice: 'shimmer',
    instructions: 'You are a medical education preceptor guiding a student through a patient interview. Keep responses brief and focused on teaching about interacting with Mr. Kato, who has chest pain.',
  },
  PATIENT: {
    name: 'Mr. Kato',
    voice: 'ash',
    instructions: 'You are Mr. Kato, a 65-year-old patient with chest pain that started 2 hours ago. The pain is sharp and radiates to your left arm. You are anxious about your condition. Keep responses brief and in character.',
  }
};

const VoiceSwitchingTest = () => {
  // State for the test interface
  const [apiKey, setApiKey] = useState<string>('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('DISCONNECTED');
  const [currentAgent, setCurrentAgent] = useState<string>('PRECEPTOR');
  const [transitionStatus, setTransitionStatus] = useState<TransitionStatus>('IDLE');
  const [messages, setMessages] = useState<Array<{role: string, content: string, agent?: string}>>([]);
  const [userMessage, setUserMessage] = useState<string>('');
  const [connectionMetrics, setConnectionMetrics] = useState<{
    initialConnectionTime?: number;
    disconnectionTime?: number;
    reconnectionTime?: number;
    totalTransitionTime?: number;
  }>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [isUsingServerKey, setIsUsingServerKey] = useState<boolean>(false);
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  
  // Add a log entry
  const addLog = (message: string) => {
    setLogs(prev => [`[${new Date().toISOString()}] ${message}`, ...prev]);
  };
  
  // Fetch ephemeral key from the server API
  const fetchEphemeralKey = async (): Promise<string | null> => {
    try {
      setIsLoadingKey(true);
      addLog('Fetching ephemeral key from server API...');
      
      const response = await fetch('/api/v1/session');
      const data = await response.json();
      
      if (!data.client_secret?.value) {
        addLog('Error: No ephemeral key provided by the server');
        return null;
      }
      
      addLog('Successfully received ephemeral key from server');
      return data.client_secret.value;
    } catch (error) {
      addLog(`Error fetching ephemeral key: ${(error as Error).message}`);
      return null;
    } finally {
      setIsLoadingKey(false);
    }
  };
  
  // Handle server events from WebRTC
  const handleServerEvent = (data: any) => {
    addLog(`Server event: ${data.type}`);
    
    if (data.type === 'transcript.message.created' || data.type === 'transcript.message.delta') {
      // Handle assistant message
      if (data.item?.role === 'assistant' && data.item.content?.[0]?.text) {
        setMessages(prev => {
          // Check if this is a delta update to an existing message
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && data.type === 'transcript.message.delta') {
            // Update the existing message
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: lastMessage.content + data.delta }
            ];
          } else {
            // Add a new message
            return [
              ...prev,
              { 
                role: 'assistant', 
                content: data.item.content[0].text,
                agent: currentAgent
              }
            ];
          }
        });
      }
    }
  };
  
  // Connect to the Realtime API
  const connect = async () => {
    if ((!apiKey && !isUsingServerKey) || !audioRef.current) {
      addLog('Error: API key or audio element not available');
      return;
    }
    
    try {
      addLog(`Connecting with ${AGENTS[currentAgent as keyof typeof AGENTS].name} voice...`);
      setSessionStatus('CONNECTING');
      
      let effectiveKey = apiKey;
      
      // If using server key, fetch it
      if (isUsingServerKey) {
        const serverKey = await fetchEphemeralKey();
        if (!serverKey) {
          addLog('Failed to get ephemeral key from server');
          setSessionStatus('DISCONNECTED');
          return;
        }
        effectiveKey = serverKey;
      }
      
      const startTime = performance.now();
      
      // Create a new manager
      managerRef.current = new WebRTCManager();
      
      // Connect to Realtime API
      const success = await managerRef.current.connect(
        effectiveKey,
        audioRef.current,
        'opus',
        handleServerEvent,
        (status) => {
          setSessionStatus(status);
          addLog(`Connection status changed: ${status}`);
        },
        (error) => {
          addLog(`Error: ${error.message}`);
        }
      );
      
      const connectionTime = performance.now() - startTime;
      setConnectionMetrics(prev => ({ ...prev, initialConnectionTime: connectionTime }));
      
      if (success) {
        addLog(`Connected in ${connectionTime.toFixed(2)}ms`);
        
        // Set session instructions and voice
        const agent = AGENTS[currentAgent as keyof typeof AGENTS];
        const updateSuccess = managerRef.current.updateSession(
          agent.instructions,
          agent.voice
        );
        
        if (updateSuccess) {
          addLog(`Session updated with ${agent.name} voice`);
        } else {
          addLog('Failed to update session');
        }
      } else {
        addLog('Connection failed');
        setSessionStatus('DISCONNECTED');
      }
    } catch (error) {
      addLog(`Connection error: ${(error as Error).message}`);
      setSessionStatus('DISCONNECTED');
    }
  };
  
  // Disconnect from the Realtime API
  const disconnect = () => {
    if (!managerRef.current) {
      addLog('No active connection to disconnect');
      return;
    }
    
    try {
      addLog('Disconnecting...');
      const startTime = performance.now();
      
      managerRef.current.disconnect();
      
      const disconnectionTime = performance.now() - startTime;
      setConnectionMetrics(prev => ({ ...prev, disconnectionTime }));
      
      addLog(`Disconnected in ${disconnectionTime.toFixed(2)}ms`);
      setSessionStatus('DISCONNECTED');
      managerRef.current = null;
    } catch (error) {
      addLog(`Disconnection error: ${(error as Error).message}`);
    }
  };
  
  // Switch to a different agent
  const switchAgent = async () => {
    if ((!apiKey && !isUsingServerKey) || !audioRef.current) {
      addLog('Error: API key or audio element not available');
      return;
    }
    
    try {
      // Start transition
      setTransitionStatus('TRANSITIONING');
      const startTime = performance.now();
      addLog(`Starting transition from ${currentAgent} to ${currentAgent === 'PRECEPTOR' ? 'PATIENT' : 'PRECEPTOR'}...`);
      
      // Phase 1: Disconnect current session
      addLog('Phase 1: Disconnecting current session');
      const disconnectStart = performance.now();
      disconnect();
      const disconnectionTime = performance.now() - disconnectStart;
      addLog(`Disconnected in ${disconnectionTime.toFixed(2)}ms`);
      
      // Save the context for reconnection
      const context = {
        messages: messages,
        currentAgent: currentAgent
      };
      addLog(`Saved conversation context with ${messages.length} messages`);
      
      // Wait briefly before reconnecting
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Phase 2: Switch agent
      const newAgent = currentAgent === 'PRECEPTOR' ? 'PATIENT' : 'PRECEPTOR';
      setCurrentAgent(newAgent);
      
      // Phase 3: Reconnect with new agent
      addLog(`Phase 3: Reconnecting with ${AGENTS[newAgent as keyof typeof AGENTS].name} voice`);
      const reconnectStart = performance.now();
      
      // Get a fresh key if using server API
      let effectiveKey = apiKey;
      if (isUsingServerKey) {
        const serverKey = await fetchEphemeralKey();
        if (!serverKey) {
          throw new Error('Failed to get ephemeral key from server');
        }
        effectiveKey = serverKey;
      }
      
      // Create a new manager
      managerRef.current = new WebRTCManager();
      
      // Connect to Realtime API
      const reconnectSuccess = await managerRef.current.connect(
        effectiveKey,
        audioRef.current,
        'opus',
        handleServerEvent,
        (status) => {
          setSessionStatus(status);
          addLog(`Connection status changed: ${status}`);
        },
        (error) => {
          addLog(`Error: ${error.message}`);
        }
      );
      
      if (!reconnectSuccess) {
        throw new Error('Reconnection failed');
      }
      
      const reconnectionTime = performance.now() - reconnectStart;
      
      // Update session with new agent voice and preserved context
      const agent = AGENTS[newAgent as keyof typeof AGENTS];
      const contextStr = JSON.stringify(context);
      
      const updateSuccess = managerRef.current.updateSession(
        `${agent.instructions}\n\nConversation context: ${contextStr}`,
        agent.voice
      );
      
      if (!updateSuccess) {
        throw new Error('Session update failed');
      }
      
      const totalTransitionTime = performance.now() - startTime;
      
      // Update metrics
      setConnectionMetrics({
        disconnectionTime,
        reconnectionTime,
        totalTransitionTime
      });
      
      addLog(`Transition completed in ${totalTransitionTime.toFixed(2)}ms`);
      setTransitionStatus('IDLE');
      
    } catch (error) {
      addLog(`Transition error: ${(error as Error).message}`);
      setTransitionStatus('FAILED');
    }
  };
  
  // Send a user message
  const sendMessage = () => {
    if (!userMessage.trim() || !managerRef.current || sessionStatus !== 'CONNECTED') {
      return;
    }
    
    try {
      // Add user message to the conversation
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      
      // Send message to the API
      const success = managerRef.current.sendEvent({
        type: 'conversation.item.create',
        item: {
          role: 'user',
          type: 'message',
          content: [
            {
              type: 'text',
              text: userMessage
            }
          ]
        }
      });
      
      if (success) {
        addLog(`Message sent: "${userMessage}"`);
        setUserMessage('');
      } else {
        addLog('Failed to send message');
      }
    } catch (error) {
      addLog(`Send message error: ${(error as Error).message}`);
    }
  };
  
  // Handle key press in message input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Toggle between server API key and manual key
  const toggleKeySource = () => {
    setIsUsingServerKey(prev => !prev);
    addLog(`Switched to ${!isUsingServerKey ? 'server' : 'manual'} API key`);
  };
  
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-2">
        <Link href="/tests" className="text-blue-600 hover:underline inline-flex items-center">
          &larr; Back to Tests
        </Link>
      </div>
    
      <h1 className="text-2xl font-bold mb-4">Voice Switching Test</h1>
      <p className="mb-4">
        This test validates the WebRTC reconnection approach for switching voices between
        Preceptor (Shimmer) and Patient (Ash).
      </p>
      
      {/* Audio element (hidden) */}
      <audio ref={audioRef} hidden />
      
      {/* API Key input */}
      <div className="mb-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded mb-2">
          <p className="text-sm">
            {isUsingServerKey 
              ? "Using server API to get ephemeral key. No manual input needed." 
              : "Enter an ephemeral API key for the OpenAI Realtime API or switch to server API."}
          </p>
        </div>
        
        <div className="flex gap-2">
          {!isUsingServerKey && (
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your OpenAI ephemeral key"
              className="flex-grow border p-2 rounded"
              disabled={sessionStatus !== 'DISCONNECTED'}
            />
          )}
          
          {sessionStatus === 'DISCONNECTED' ? (
            <>
              <button
                onClick={connect}
                disabled={(isUsingServerKey ? false : !apiKey) || isLoadingKey}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
              >
                {isLoadingKey ? 'Loading Key...' : 'Connect'}
              </button>
              
              <button
                onClick={toggleKeySource}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
              >
                {isUsingServerKey ? 'Use Manual Key' : 'Use Server Key'}
              </button>
            </>
          ) : (
            <button
              onClick={disconnect}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
      
      {/* Current status */}
      <div className="mb-4 p-4 bg-gray-50 border rounded grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-medium">Connection Status</h3>
          <div className="flex items-center mt-1">
            <div 
              className={`w-2 h-2 rounded-full mr-2 ${
                sessionStatus === 'CONNECTED' ? 'bg-green-500' : 
                sessionStatus === 'CONNECTING' ? 'bg-yellow-500' : 'bg-red-500'
              }`} 
            />
            <span>{sessionStatus}</span>
          </div>
        </div>
        
        <div>
          <h3 className="font-medium">Current Agent</h3>
          <div className="flex items-center mt-1">
            <span className="font-medium">
              {AGENTS[currentAgent as keyof typeof AGENTS].name} (Voice: {AGENTS[currentAgent as keyof typeof AGENTS].voice})
            </span>
          </div>
        </div>
        
        {connectionMetrics.totalTransitionTime && (
          <div className="col-span-2">
            <h3 className="font-medium">Last Transition Performance</h3>
            <div className="grid grid-cols-3 gap-2 mt-1 text-sm">
              <div>
                <span className="text-gray-600">Disconnection:</span> {connectionMetrics.disconnectionTime?.toFixed(2)}ms
              </div>
              <div>
                <span className="text-gray-600">Reconnection:</span> {connectionMetrics.reconnectionTime?.toFixed(2)}ms
              </div>
              <div>
                <span className="text-gray-600">Total Transition:</span> {connectionMetrics.totalTransitionTime?.toFixed(2)}ms
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Agent switcher */}
      <div className="mb-4">
        <button
          onClick={switchAgent}
          disabled={sessionStatus !== 'CONNECTED' || transitionStatus === 'TRANSITIONING' || isLoadingKey}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white px-4 py-3 rounded disabled:bg-gray-300 font-medium"
        >
          {transitionStatus === 'TRANSITIONING' ? (
            'Switching Agent...'
          ) : isLoadingKey ? (
            'Loading Key...'
          ) : (
            `Switch to ${currentAgent === 'PRECEPTOR' ? 'Mr. Kato (Patient)' : 'Preceptor'}`
          )}
        </button>
      </div>
      
      {/* Conversation */}
      <div className="mb-4 border rounded-lg overflow-hidden">
        <div className="bg-gray-50 border-b p-3">
          <h3 className="font-medium">Conversation</h3>
        </div>
        
        <div className="h-80 overflow-y-auto p-4 flex flex-col space-y-4" style={{ scrollBehavior: 'smooth' }}>
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 italic py-10">
              No messages yet. Start the conversation to test the agent.
            </div>
          ) : (
            messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-3/4 rounded-lg p-3 ${
                    msg.role === 'user' 
                      ? 'bg-blue-100 text-blue-900' 
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {msg.agent && (
                    <div className="text-xs font-medium mb-1">
                      {msg.agent === 'PRECEPTOR' ? 'Preceptor' : 'Mr. Kato'}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="border-t p-3">
          <div className="flex">
            <textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              className="flex-grow border rounded-l p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={sessionStatus !== 'CONNECTED'}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!userMessage.trim() || sessionStatus !== 'CONNECTED'}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-r disabled:bg-gray-300"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      
      {/* Logs */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 border-b p-3 flex justify-between items-center">
          <h3 className="font-medium">Test Logs</h3>
          <button
            onClick={() => setLogs([])}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            Clear Logs
          </button>
        </div>
        
        <div className="h-48 overflow-y-auto p-2 bg-gray-900 text-gray-100 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic p-2">No logs yet</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="p-1 border-b border-gray-800">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceSwitchingTest; 
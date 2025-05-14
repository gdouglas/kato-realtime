'use client';

import React, { useState, useRef } from 'react';
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

// Context preservation strategies
const STRATEGIES = {
  BASIC: {
    name: 'Basic',
    description: 'Simple strategy that passes all messages without additional processing',
    preserveContext: (messages: any[], currentAgent: string, targetAgent: string) => {
      return {
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      };
    }
  },
  AGENT_AWARE: {
    name: 'Agent-Aware',
    description: 'Includes agent information with each message for better context awareness',
    preserveContext: (messages: any[], currentAgent: string, targetAgent: string) => {
      return {
        currentAgent: targetAgent,
        previousAgent: currentAgent,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          agent: msg.agent
        }))
      };
    }
  },
  ROLE_BASED: {
    name: 'Role-Based',
    description: 'Organizes context by agent roles for specialized context handling',
    preserveContext: (messages: any[], currentAgent: string, targetAgent: string) => {
      // Filter messages by agent
      const preceptorMessages = messages
        .filter(msg => msg.agent === 'PRECEPTOR')
        .map(msg => msg.content);
        
      const patientMessages = messages
        .filter(msg => msg.agent === 'PATIENT')
        .map(msg => msg.content);
      
      return {
        allMessages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          agent: msg.agent
        })),
        roles: {
          preceptor: {
            context: AGENTS.PRECEPTOR.instructions,
            messages: preceptorMessages
          },
          patient: {
            context: AGENTS.PATIENT.instructions,
            messages: patientMessages
          }
        },
        currentRole: targetAgent === 'PRECEPTOR' ? 'preceptor' : 'patient'
      };
    }
  }
};

const ContextPreservationTest = () => {
  // State for the test interface
  const [apiKey, setApiKey] = useState<string>('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('DISCONNECTED');
  const [currentAgent, setCurrentAgent] = useState<string>('PRECEPTOR');
  const [transitionStatus, setTransitionStatus] = useState<TransitionStatus>('IDLE');
  const [messages, setMessages] = useState<Array<{role: string, content: string, agent?: string}>>([]);
  const [userMessage, setUserMessage] = useState<string>('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('BASIC');
  const [testResults, setTestResults] = useState<Array<{
    strategy: string;
    success: boolean;
    reconnectionTime: number;
    responseQuality: number | null;
  }>>([]);
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
      
      const response = await fetch('/api/session');
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
      
      // Get key from server if using server API
      let effectiveKey = apiKey;
      if (isUsingServerKey) {
        const serverKey = await fetchEphemeralKey();
        if (!serverKey) {
          addLog('Failed to get ephemeral key from server');
          setSessionStatus('DISCONNECTED');
          return;
        }
        effectiveKey = serverKey;
      }
      
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
      
      if (success) {
        addLog(`Connected successfully`);
        
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
      managerRef.current.disconnect();
      addLog('Disconnected');
      setSessionStatus('DISCONNECTED');
      managerRef.current = null;
    } catch (error) {
      addLog(`Disconnection error: ${(error as Error).message}`);
    }
  };
  
  // Switch to a different agent with the selected context preservation strategy
  const switchAgentWithStrategy = async () => {
    if ((!apiKey && !isUsingServerKey) || !audioRef.current) {
      addLog('Error: API key or audio element not available');
      return;
    }
    
    try {
      // Start transition
      setTransitionStatus('TRANSITIONING');
      const startTime = performance.now();
      
      const strategy = STRATEGIES[selectedStrategy as keyof typeof STRATEGIES];
      const targetAgent = currentAgent === 'PRECEPTOR' ? 'PATIENT' : 'PRECEPTOR';
      
      addLog(`Starting transition from ${currentAgent} to ${targetAgent} using ${strategy.name} strategy...`);
      
      // Phase 1: Disconnect current session
      addLog('Phase 1: Disconnecting current session');
      disconnect();
      
      // Phase 2: Prepare context using selected strategy
      addLog(`Phase 2: Preparing context using ${strategy.name} strategy`);
      const preservedContext = strategy.preserveContext(messages, currentAgent, targetAgent);
      addLog(`Context prepared: ${JSON.stringify(preservedContext).substring(0, 100)}...`);
      
      // Wait briefly before reconnecting
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Phase 3: Update current agent
      setCurrentAgent(targetAgent);
      
      // Phase 4: Reconnect with new agent
      addLog(`Phase 4: Reconnecting with ${AGENTS[targetAgent as keyof typeof AGENTS].name} voice`);
      
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
      const reconnectStart = performance.now();
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
      const agent = AGENTS[targetAgent as keyof typeof AGENTS];
      const contextStr = JSON.stringify(preservedContext);
      
      addLog(`Phase 5: Updating session with new context`);
      const updateSuccess = managerRef.current.updateSession(
        `${agent.instructions}\n\nConversation context: ${contextStr}`,
        agent.voice
      );
      
      if (!updateSuccess) {
        throw new Error('Session update failed');
      }
      
      const totalTransitionTime = performance.now() - startTime;
      
      // Add to test results
      setTestResults(prev => [
        ...prev,
        {
          strategy: selectedStrategy,
          success: true,
          reconnectionTime,
          responseQuality: null // Will be rated after receiving response
        }
      ]);
      
      addLog(`Transition completed in ${totalTransitionTime.toFixed(2)}ms`);
      setTransitionStatus('IDLE');
      
    } catch (error) {
      addLog(`Transition error: ${(error as Error).message}`);
      setTransitionStatus('FAILED');
      
      // Add to test results
      setTestResults(prev => [
        ...prev,
        {
          strategy: selectedStrategy,
          success: false,
          reconnectionTime: 0,
          responseQuality: null
        }
      ]);
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
  
  // Rate the response quality (1-5)
  const rateResponseQuality = (strategy: string, rating: number) => {
    setTestResults(prev => 
      prev.map(result => 
        result.strategy === strategy && result.responseQuality === null
          ? { ...result, responseQuality: rating }
          : result
      )
    );
    
    addLog(`Response using ${strategy} strategy rated: ${rating}/5`);
  };
  
  // Reset tests
  const resetTests = () => {
    setTestResults([]);
    addLog('Test results reset');
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
      
      <h1 className="text-2xl font-bold mb-4">Context Preservation Test</h1>
      <p className="mb-4">
        Test different strategies for preserving conversation context during voice switching.
        Compare which strategy provides the best continuity for the conversation.
      </p>
      
      {/* Audio element (hidden) */}
      <audio ref={audioRef} hidden />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
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
          <div className="mb-4 p-4 bg-gray-50 border rounded">
            <div className="flex justify-between mb-2">
              <div>
                <span className="font-medium">Connection Status:</span>{' '}
                <span className={
                  sessionStatus === 'CONNECTED' ? 'text-green-600' : 
                  sessionStatus === 'CONNECTING' ? 'text-yellow-600' : 'text-red-600'
                }>
                  {sessionStatus}
                </span>
              </div>
              <div>
                <span className="font-medium">Current Agent:</span>{' '}
                <span className="font-medium">
                  {AGENTS[currentAgent as keyof typeof AGENTS].name} (Voice: {AGENTS[currentAgent as keyof typeof AGENTS].voice})
                </span>
              </div>
            </div>
            
            <div>
              <span className="font-medium">Strategy:</span>
              <select 
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="ml-2 border rounded p-1"
                disabled={transitionStatus === 'TRANSITIONING'}
              >
                {Object.entries(STRATEGIES).map(([key, strategy]) => (
                  <option key={key} value={key}>{strategy.name}</option>
                ))}
              </select>
              <span className="ml-2 text-xs text-gray-500">
                {STRATEGIES[selectedStrategy as keyof typeof STRATEGIES].description}
              </span>
            </div>
          </div>
          
          {/* Agent switcher */}
          <div className="mb-4">
            <button
              onClick={switchAgentWithStrategy}
              disabled={sessionStatus !== 'CONNECTED' || transitionStatus === 'TRANSITIONING' || isLoadingKey}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white px-4 py-3 rounded disabled:bg-gray-300 font-medium"
            >
              {transitionStatus === 'TRANSITIONING' ? (
                'Switching Agent...'
              ) : isLoadingKey ? (
                'Loading Key...'
              ) : (
                `Switch to ${currentAgent === 'PRECEPTOR' ? 'Mr. Kato (Patient)' : 'Preceptor'} using ${STRATEGIES[selectedStrategy as keyof typeof STRATEGIES].name} Strategy`
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
                  No messages yet. Start the conversation to test context preservation.
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
        </div>
        
        <div>
          {/* Test Results */}
          <div className="mb-4 border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b p-3 flex justify-between items-center">
              <h3 className="font-medium">Test Results</h3>
              <button
                onClick={resetTests}
                className="text-sm text-gray-500 hover:text-red-500"
              >
                Reset Results
              </button>
            </div>
            
            <div className="p-4">
              {testResults.length === 0 ? (
                <div className="text-center text-gray-500 italic py-4">
                  No tests completed yet. Switch agents to test a strategy.
                </div>
              ) : (
                <div className="space-y-4">
                  {testResults.map((result, index) => (
                    <div key={index} className="border rounded p-3">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium">{STRATEGIES[result.strategy as keyof typeof STRATEGIES].name} Strategy</span>
                        <span className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                          {result.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      
                      {result.success && (
                        <>
                          <div className="text-sm mb-2">
                            Reconnection Time: <span className="font-mono">{result.reconnectionTime.toFixed(2)}ms</span>
                          </div>
                          
                          <div className="text-sm">
                            <div className="mb-1">Response Quality:</div>
                            {result.responseQuality === null ? (
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(rating => (
                                  <button
                                    key={rating}
                                    onClick={() => rateResponseQuality(result.strategy, rating)}
                                    className="w-8 h-8 rounded border hover:bg-gray-100 flex items-center justify-center"
                                  >
                                    {rating}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map(rating => (
                                  <span
                                    key={rating}
                                    className={`w-8 h-8 rounded flex items-center justify-center ${
                                      rating <= result.responseQuality! ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'
                                    }`}
                                  >
                                    {rating}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
            
            <div className="h-96 overflow-y-auto p-2 bg-gray-900 text-gray-100 font-mono text-xs">
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
      </div>
    </div>
  );
};

export default ContextPreservationTest; 
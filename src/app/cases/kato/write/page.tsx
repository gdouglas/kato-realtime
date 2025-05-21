"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { useAgentContext } from '@/app/contexts/AgentContext';
import { useAgentLifecycle } from '@/app/contexts/AgentLifecycleContext';
import { useIntroAudio } from '@/app/hooks/useIntroAudio';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { TranscriptItem, SessionStatus, AgentConfig } from '@/app/types';
import BottomBar from "@/app/components/BottomBar/BottomBar";
import CaseInfoModal from "@/app/components/CaseInfoModal";
import KatoIntroScreen from "@/app/components/KatoIntroScreen";
import AgentSwitcher from "@/app/components/AgentSwitcher/AgentSwitcher";
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { v4 as uuidv4 } from "uuid";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const WritePage = () => {
  const { transcriptItems, addTranscriptBreadcrumb } = useTranscript();
  const router = useRouter();
  const agentLifecycle = useAgentLifecycle();
  const eventBus = useEventBus();
  const { 
    sessionStatus,
    currentAgentConfig,
  } = agentLifecycle.state.context;
  
  // Add data channel reference
  const dcRef = useRef<RTCDataChannel | null>(null);
  
  // Get data channel from XState context
  const contextDc = agentLifecycle.state.context.dc;
  
  // Update dcRef when XState context dc changes
  useEffect(() => {
    if (contextDc) {
      console.log('[WritePage] Data channel from context assigned to reference');
      dcRef.current = contextDc;
    } else {
      dcRef.current = null;
    }
  }, [contextDc]);
  
  // Add handler for SEND_MESSAGE_TO_SERVER events
  useEffect(() => {
    const handleSendMessageToServer = (data: { eventObj: any, eventNameSuffix?: string }) => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        const messagePayload = JSON.stringify(data.eventObj);
        console.log(`[WritePage] Sending message to server: ${data.eventObj?.type}`, data.eventObj);
        dcRef.current.send(messagePayload);
      } else {
        console.error(`[WritePage] Error: Data channel not open. Event: ${data.eventObj?.type}`);
        addTranscriptBreadcrumb("Error: Data channel not open.");
      }
    };
    const unsubscribe = eventBus.on(KatoEvents.SEND_MESSAGE_TO_SERVER, handleSendMessageToServer);
    return () => unsubscribe();
  }, [eventBus, dcRef, addTranscriptBreadcrumb]);
  
  const { 
    selectedAgentName,
    selectAgent,
    isSwitchingInProgress,
    patientAgent,
    preceptorAgent,
  } = useAgentContext();
  const { isIntroAudioPlaying } = useIntroAudio({ addTranscriptBreadcrumb });

  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);
  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(!selectedAgentName);
  const [currentUserInput, setCurrentUserInput] = useState<string>("");
  const [isFunctionCallInProgress, setIsFunctionCallInProgress] = useState<boolean>(false);

  // Similar to speak page, track when an agent is selected/deselected to show/hide intro screen
  useEffect(() => {
    if (selectedAgentName) {
      setShowIntroScreen(false);
    } else {
      setShowIntroScreen(true);
    }
  }, [selectedAgentName]);

  // Listen for tool call events
  useEffect(() => {
    const handleToolCallStarted = () => setIsFunctionCallInProgress(true);
    const handleToolCallCompleted = () => setIsFunctionCallInProgress(false);
    
    const subStart = eventBus.on(KatoEvents.TOOL_CALL_STARTED, handleToolCallStarted);
    const subComplete = eventBus.on(KatoEvents.TOOL_CALL_COMPLETED, handleToolCallCompleted);
    
    return () => {
      subStart();
      subComplete();
    };
  }, [eventBus]);

  // Add effect to monitor session status changes
  useEffect(() => {
    console.log(`[WritePage] Session status changed to: ${sessionStatus}`);
  }, [sessionStatus]);

  const messages = transcriptItems.filter(
    (item): item is TranscriptItem & { type: 'MESSAGE' } => item.type === 'MESSAGE' && !item.isHidden
  );

  const onToggleConnection = () => {
    if (!currentAgentConfig) {
      addTranscriptBreadcrumb("No agent selected. Cannot connect.");
      console.error("No agent selected, cannot toggle connection");
      return;
    }
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      agentLifecycle.send({ type: "USER_REQUESTED_DISCONNECT" });
    } else {
      if (agentLifecycle.state.matches('idle')) {
        if (currentAgentConfig && currentAgentConfig.name) {
          agentLifecycle.send({ type: 'SELECT_AGENT', agentName: currentAgentConfig.name });
        } else {
          addTranscriptBreadcrumb("No agent configured to select for connection.");
          console.error("No agent selected for SELECT_AGENT.");
        }
      } else {
        // Fallback for other non-connected states (e.g., error states), mirroring speak page logic
        addTranscriptBreadcrumb("Attempting to retry connection...");
        agentLifecycle.send({ type: 'RETRY' });
      }
    }
  };

  const handleNavigateToSpeak = () => {
    console.log("[WritePage] Navigating to speak page");
    eventBus.emit(KatoEvents.NAVIGATE_TO_WRITE_CLICKED); // Using same event for consistency
    router.push('/cases/kato/speak');
  };

  const handleCreateDDx = async () => {
    if (!currentAgentConfig) {
      console.error("Cannot create DDx, no current agent config");
      addTranscriptBreadcrumb("Error: No agent selected to create DDx for.");
      return;
    }
    const uniqueId = uuidv4();
    console.log("DDX Create Clicked (Write Page):", { agent: currentAgentConfig.name, ddx_session_id: uniqueId });
    addTranscriptBreadcrumb(`Starting DDx creation for ${currentAgentConfig.publicDescription}...`);
    try {
      const response = await fetch(`${API_BASE_URL}/cases/kato/ddx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_name: currentAgentConfig.name, ddx_session_id: uniqueId }), 
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      if (data.ddx_url) {
        addTranscriptBreadcrumb(`DDx created successfully. Redirecting...`);
        router.push(data.ddx_url);
      } else {
        throw new Error("DDx URL not found in response");
      }
    } catch (error) {
      console.error("Error creating DDx:", error);
      addTranscriptBreadcrumb(`Error creating DDx: ${error instanceof Error ? error.message : String(error)}`);
      console.log("DDX Create Failed (Write Page):", { agent: currentAgentConfig.name, ddx_session_id: uniqueId, error: String(error) });
    }
  };

  // Handler functions for intro screen buttons
  const handleStartWithPatient = () => {
    console.log(`[WritePage] User selected Start With Patient.`);
    selectAgent("mrKato");
  };

  const handleStartWithPreceptor = () => {
    console.log(`[WritePage] User selected Start With Preceptor.`);
    selectAgent("preceptor");
  };

  // Function to send a text message to the agent
  const sendTextMessage = async (text: string) => {
    console.log("[WritePage] sendTextMessage called with:", text);
    console.log("[WritePage] Connection status:", sessionStatus);
    console.log("[WritePage] Data channel:", dcRef?.current?.readyState);
    
    if (!text.trim() || sessionStatus !== "CONNECTED" || isSwitchingInProgress || isIntroAudioPlaying || isFunctionCallInProgress) {
      console.log("[WritePage] Cannot send message, conditions not met:", {
        emptyText: !text.trim(),
        notConnected: sessionStatus !== "CONNECTED", 
        isSwitchingInProgress, 
        isIntroAudioPlaying,
        isFunctionCallInProgress
      });
      return;
    }

    try {
      const messageId = uuidv4();
      
      // Create local message immediately for better UX
      const localMessageText = text;
      addTranscriptBreadcrumb(`Sending text message: "${localMessageText}"`);
      
      // Clear input field
      setCurrentUserInput("");
      
      // Send the message to the server
      console.log("[WritePage] Emitting SEND_MESSAGE_TO_SERVER event with:", {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: localMessageText
            }
          ]
        }
      });
      
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
        eventObj: {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: localMessageText
              }
            ]
          }
        },
        eventNameSuffix: "user_text_message_write_page"
      });
      
      // Create a transcript item with the message
      console.log("[WritePage] Emitting SERVER_TRANSCRIPT_ITEM event with:", {
        idToAssign: messageId,
        role: 'user',
        title: localMessageText,
        isLocal: true,
        agentName: currentAgentConfig?.name
      });
      
      eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM, {
        idToAssign: messageId,
        role: 'user',
        title: localMessageText,
        isLocal: true,
        agentName: currentAgentConfig?.name
      });
      
      // Trigger a response from the agent
      console.log("[WritePage] Sending response.create to generate agent reply");
      setTimeout(() => {
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
          eventObj: {
            type: "response.create",
            response: {
              modalities: ["text"]  // Only request text response for write mode
            }
          },
          eventNameSuffix: "trigger_response_write_page"
        });
      }, 100);
      
    } catch (error) {
      console.error("Error sending text message:", error);
      addTranscriptBreadcrumb(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Listen for agent changes from the state machine
  useEffect(() => {
    const handleAgentChangedPageLogic = (data?: { newAgentName?: string; agentConfig?: AgentConfig }) => { 
      console.log(`[WritePage] Agent changed via EventBus to: ${data?.newAgentName}`);
    };
    const unsubscribe = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChangedPageLogic);
    return () => unsubscribe();
  }, [eventBus]);

  if (showIntroScreen) {
    return <KatoIntroScreen onStartWithPatient={handleStartWithPatient} onStartWithPreceptor={handleStartWithPreceptor} />;
  }

  const disableAgentSwitchers = isIntroAudioPlaying || isSwitchingInProgress;
  const isConnected = sessionStatus === "CONNECTED";
  const isInputDisabled = !isConnected || isSwitchingInProgress || isIntroAudioPlaying || isFunctionCallInProgress;

  return (
    <div className="p-4 h-full flex flex-col pb-20 relative">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
          Chat with {currentAgentConfig?.displayName || "Agent"}
        </h1>
        <div className="text-sm text-gray-500">
          {isConnected && <span className="text-green-600">Connected</span>}
          {sessionStatus === "CONNECTING" && <span className="text-yellow-600">Connecting...</span>}
          {sessionStatus === "DISCONNECTED" && <span>Disconnected</span>}
          {sessionStatus === "ERROR" && <span className="text-red-600">Error</span>}
        </div>
      </div>
      
      <div className="flex-grow overflow-y-auto mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        {messages.length === 0 ? (
          <div className="flex-grow flex items-center justify-center text-gray-500">
            No messages yet. Type a message below to start the conversation.
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((item) => (
              <li key={item.itemId} className={`p-3 rounded-lg ${item.role === 'user' ? 'bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 ml-auto max-w-[80%]' : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 max-w-[80%]'}`}>
                <div className="flex items-center mb-1">
                  <span className="font-semibold capitalize text-xs">{item.role}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{item.timestamp}</span>
                </div>
                <div className="whitespace-pre-wrap">{item.title}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Text Input Area */}
      <div className="mb-4">
        <div className="flex">
          <input
            type="text"
            value={currentUserInput}
            onChange={(e) => setCurrentUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendTextMessage(currentUserInput)}
            placeholder={isInputDisabled ? "Connect to an agent first..." : "Type your message here..."}
            className="flex-1 p-3 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-100 text-black"
            disabled={isInputDisabled}
          />
          <button
            onClick={() => sendTextMessage(currentUserInput)}
            disabled={isInputDisabled || !currentUserInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Send
          </button>
        </div>
        {isFunctionCallInProgress && (
          <p className="text-xs text-yellow-600 mt-1">Processing function call, please wait...</p>
        )}
        {!isConnected && sessionStatus !== "CONNECTING" && (
          <p className="text-xs text-gray-500 mt-1">Connect to an agent to start chatting</p>
        )}
      </div>
      
      {/* Agent Switcher component */}
      <AgentSwitcher
        currentAgentConfig={currentAgentConfig}
        patientAgent={patientAgent}
        preceptorAgent={preceptorAgent}
        disableAgentSwitchers={disableAgentSwitchers}
        isIntroAudioPlaying={isIntroAudioPlaying}
        onSelectAgent={selectAgent}
      />
      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
      <BottomBar 
        sessionStatus={sessionStatus as SessionStatus}
        currentAgentConfig={currentAgentConfig as AgentConfig | null | undefined}
        isSwitchingInProgress={isSwitchingInProgress}
        isIntroAudioPlaying={isIntroAudioPlaying}
        onToggleConnection={onToggleConnection}
        onNavigateToWrite={handleNavigateToSpeak}
        onCreateDDx={handleCreateDDx}
        isWritePage={true}
      />
    </div>
  );
};

export default WritePage;

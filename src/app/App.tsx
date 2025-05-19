"use client";

import React, { useEffect, /* useRef, */ useState, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";
import Events from "@/app/components/Events";
import SettingsButton from "@/app/components/Settings/SettingsButton";
import SettingsModal from "@/app/components/Settings/SettingsModal";

// Types
import { AgentConfig } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useAgentLifecycle } from "@/app/contexts/AgentLifecycleContext";
import { useEventBus } from "./contexts/EventBusContext";
import { useToolExecutor } from "./hooks/useToolExecutor";
import { useTranscriptGuardrails } from "./hooks/useTranscriptGuardrails";

// Utilities
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

// Define the base URL for your FastAPI backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function AppContents() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const agentLifecycle = useAgentLifecycle();
  const eventBus = useEventBus();
  useToolExecutor();
  useTranscriptGuardrails();

  const isWritePage = pathname === "/cases/kato/write";

  // Derive state from XState machine
  const xstateSessionStatus = agentLifecycle.state.context.sessionStatus;
  const xstateSelectedAgentName = agentLifecycle.state.context.selectedAgentName;
  const xstateCurrentAgentConfig = agentLifecycle.state.context.currentAgentConfig;
  const xstateError = agentLifecycle.state.context.error;
  const xstateDc = agentLifecycle.state.context.dc;
  const xstatePc = agentLifecycle.state.context.pc;

  const urlCodec = searchParams.get("codec") || "opus";
  const initialAgentName = searchParams.get("agent") || undefined;

  const {
    transcriptItems,
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    clearTranscriptItems,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();
  
  const [selectedAgentConfigSetKey, setSelectedAgentConfigSetKey] =
    useState<string>(defaultAgentSetKey);
  const selectedAgentConfigSet = allAgentSets[selectedAgentConfigSetKey];

  const [userResponseSuggestions, setUserResponseSuggestions] = useState<string[]>([]);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState(false);
  const [showMicDeniedModal, setShowMicDeniedModal] = useState(false);
  const [micAccessError, setMicAccessError] = useState(false);
  const [audioInputMode, setAudioInputMode] = useState<string>("push_to_talk");
  const [currentUserInput, setCurrentUserInput] = useState<string>("");

  const [isFunctionCallInProgress, setIsFunctionCallInProgress] = useState(false);

  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const newSessionId = uuidv4().slice(0, 32);
    setSessionId(newSessionId);
  }, []);

  useEffect(() => {
    const agentToSelect = initialAgentName || selectedAgentConfigSet[0]?.name;
    if (agentToSelect && !xstateSelectedAgentName && agentLifecycle.state.matches('idle')) {
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName: agentToSelect });
      addTranscriptBreadcrumb(
        `Initial agent from URL/default: ${agentToSelect}`
      );
    }
  }, [initialAgentName, selectedAgentConfigSet, agentLifecycle, xstateSelectedAgentName, addTranscriptBreadcrumb]);

  useEffect(() => {
    if (xstateCurrentAgentConfig && agentLifecycle.state.matches('agentActive')) {
      addTranscriptMessage(uuidv4(), "assistant", `Welcome to ${xstateCurrentAgentConfig.name}! How can I help you today?`);
    }
  }, [xstateCurrentAgentConfig, agentLifecycle.state, addTranscriptMessage]);

  useEffect(() => {
    const handleShowMicDenied = () => setShowMicDeniedModal(true);
    const handleAudioInputModeChanged = (mode: string) => setAudioInputMode(mode);
    const handleOutputAudioBufferStatusChanged = (isActive: boolean) => {
      setIsOutputAudioBufferActive(isActive);
    };
    const handleOutputAudioBufferClearRequested = () => {
      console.log("[AppContents] Event: OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED. Audio element is managed by RootLayout/AgentLifecycleMachine.");
    };
    const handleAgentSwitchCompleted = (eventData: { agentName: string; success: boolean; }) => {
      if (eventData.success) {
        console.log(`[AppContents] Agent switch completed for ${eventData.agentName}, clearing suggestions.`);
        setUserResponseSuggestions([]);
      }
    };
    const handleToolCallStarted = (eventData: { callId?: string; functionName: string; argsString: string; }) => {
      console.log(`[AppContents] Tool call started: ${eventData.functionName} (${eventData.callId || 'N/A'})`);
      setIsFunctionCallInProgress(true);
    };
    const handleToolCallCompleted = (eventData: { callId?: string; functionName: string; success: boolean; result?: any; error?: any; }) => {
      console.log(`[AppContents] Tool call completed: ${eventData.functionName} (${eventData.callId || 'N/A'}), Success: ${eventData.success}`);
      setIsFunctionCallInProgress(false);
    };
    const handleMicrophoneAccessError = (eventData: { error?: string }) => {
      console.log(`[AppContents] Microphone access error: ${eventData.error || 'Unknown error'}`);
      setMicAccessError(true);
    };
    const handleMicrophoneAccessRecovered = () => {
      console.log(`[AppContents] Microphone access recovered or connection succeeded.`);
      setMicAccessError(false);
    };

    const unsubShowMicDenied = eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, handleShowMicDenied);
    const unsubAudioInputMode = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChanged);
    const unsubOutputAudioStatus = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleOutputAudioBufferStatusChanged);
    const unsubOutputAudioClear = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED, handleOutputAudioBufferClearRequested);
    const unsubAgentSwitchCompleted = eventBus.on(KatoEvents.AGENT_SWITCH_COMPLETED, handleAgentSwitchCompleted);
    const unsubToolCallStarted = eventBus.on(KatoEvents.TOOL_CALL_STARTED, handleToolCallStarted);
    const unsubToolCallCompleted = eventBus.on(KatoEvents.TOOL_CALL_COMPLETED, handleToolCallCompleted);
    const unsubMicError = eventBus.on(KatoEvents.MICROPHONE_ACCESS_ERROR, handleMicrophoneAccessError);
    const unsubMicRecovered = eventBus.on(KatoEvents.MICROPHONE_ACCESS_RECOVERED, handleMicrophoneAccessRecovered);

    return () => {
      unsubShowMicDenied();
      unsubAudioInputMode();
      unsubOutputAudioStatus();
      unsubOutputAudioClear();
      unsubAgentSwitchCompleted();
      unsubToolCallStarted();
      unsubToolCallCompleted();
      unsubMicError();
      unsubMicRecovered();
    };
  }, [eventBus]);


  const handleAgentSelection = (agentName: string) => {
    if (agentName !== xstateSelectedAgentName) {
      addTranscriptBreadcrumb(`UI: User selected agent: ${agentName}`);
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName: agentName });
      clearTranscriptItems();
    }
  };

  const handleConnectDisconnect = useCallback(() => {
    logClientEvent(
      { agent: xstateCurrentAgentConfig?.name, sessionStatus: xstateSessionStatus },
      "button.connect_disconnect.click"
    );
    if (agentLifecycle.state.matches('agentActive') || agentLifecycle.state.matches('connecting')) {
      agentLifecycle.send({ type: 'USER_REQUESTED_DISCONNECT' });
    } else if (xstateSelectedAgentName && (agentLifecycle.state.matches('idle') || agentLifecycle.state.matches('connectionError') || agentLifecycle.state.matches('switchError') || agentLifecycle.state.matches('errorIntroFailed'))) {
      agentLifecycle.send({ type: 'RETRY' });
    }
  }, [
    agentLifecycle,
    xstateSelectedAgentName,
    xstateCurrentAgentConfig,
    xstateSessionStatus,
    logClientEvent,
  ]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    logClientEvent({ text }, "user.input.text");

    const messageId = uuidv4();
    addTranscriptMessage(messageId, "user", text);
    setCurrentUserInput(""); // Clear input after sending

    if (xstateDc && xstateDc.readyState === "open") {
      const message = {
        event: "user_message",
        message_id: messageId,
        text: text,
      };
      xstateDc.send(JSON.stringify(message));
      logClientEvent(message, "rtc.user_message.sent");
    } else {
      console.error("Data channel not open or not available.");
      addTranscriptMessage(uuidv4(), "system", "Error: Connection not established. Cannot send message.", true);
    }
  }, [xstateDc, addTranscriptMessage, logClientEvent]);


  const sendFunctionCallResponse = useCallback((toolCallId: string, response: any) => {
    if (xstateDc && xstateDc.readyState === "open") {
      const message = {
        event: "function_call_response",
        tool_call_id: toolCallId,
        response: response,
      };
      xstateDc.send(JSON.stringify(message));
      console.log("[AppContents] Sent function call response:", message);
      logClientEvent(message, "rtc.function_call_response.sent");
    } else {
      console.error("Data channel not open. Cannot send function call response.");
      addTranscriptMessage(uuidv4(), "system", "Error: Connection not established. Cannot send function response.", true);
    }
  }, [xstateDc, addTranscriptMessage, logClientEvent]);

  const handleAudioInput = useCallback((audioBlob: Blob, durationMillis: number) => {
    if (isWritePage) {
      console.log("[AppContents] Audio input ignored on write page.");
      return;
    }
    if (xstateDc && xstateDc.readyState === "open") {
      const messageId = uuidv4();
      const reader = new FileReader();
      reader.onload = () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const message = {
          event: "user_audio",
          message_id: messageId,
          audio_data: base64Audio,
          duration_millis: durationMillis,
          mime_type: audioBlob.type, 
          timestamp: new Date().toISOString(),
        };
        xstateDc.send(JSON.stringify(message));
        logClientEvent({ message_id: messageId, duration_millis: durationMillis, mime_type: audioBlob.type }, "rtc.user_audio.sent");
      };
      reader.readAsDataURL(audioBlob);
    } else {
      console.error("Data channel not open. Cannot send audio.");
       addTranscriptMessage(uuidv4(), "system", "Error: Connection not established. Cannot send audio.", true);
    }
  }, [xstateDc, addTranscriptMessage, logClientEvent, isWritePage]);

  // UI rendering
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <header className="p-2 border-b dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center">
          <Image
            src="/logos/kato-logo.png"
            alt="Kato Logo"
            width={32}
            height={32}
            className="mr-2"
          />
          <h1 className="text-md font-semibold text-gray-800 dark:text-white">
            Mr Kato - Realtime Patient Simulator
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <SettingsButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col p-1 md:p-2 overflow-y-auto">
          <Transcript
            onSendText={sendTextMessage}
            onSendAudio={handleAudioInput}
            currentUserInput={currentUserInput}
            setCurrentUserInput={setCurrentUserInput}
            currentAgentName={xstateSelectedAgentName}
            isAgentLoading={agentLifecycle.state.matches('connecting') || agentLifecycle.state.matches('playingIntro') || agentLifecycle.state.matches('activatingAgent')}
            isSwitchingAgent={agentLifecycle.state.matches('preparingToSwitch') || agentLifecycle.state.matches('disconnectingForSwitch')}
            isFunctionCallInProgress={isFunctionCallInProgress}
            userResponseSuggestions={userResponseSuggestions}
            audioInputMode={audioInputMode} 
            micAccessError={micAccessError}
            onMicAccessError={() => setMicAccessError(true)}
            onMicAccessRecovered={() => setMicAccessError(false)}
            micDisabled={isWritePage}
          />
        </main>
        <aside className="w-1/3 lg:w-1/4 p-1 md:p-2 border-l dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-800">
          <Events isExpanded={true} />
        </aside>
      </div>

      {showMicDeniedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl dark:bg-gray-800">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">Microphone Access Denied</h2>
            <p className="mb-4 dark:text-gray-300">Kato needs microphone access to function. Please enable it in your browser settings.</p>
            <button 
              onClick={() => setShowMicDeniedModal(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <SettingsModal />
    </div>
  );
}

// The main App component now simply renders AppContents.
// Providers (EventBusProvider, TranscriptProvider, EventProvider, AgentLifecycleProvider) 
// are expected to be in a higher-level component, e.g., src/app/layout.tsx.
const App: React.FC = () => {
  return <AppContents />;
};

export default App;

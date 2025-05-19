"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
// import { motion, AnimatePresence } from "framer-motion"; // Not used in text page layout
// import { LuWifiOff, LuLoader } from "react-icons/lu"; // Not used in text page layout
import { LuInfo } from "react-icons/lu";
import { useRouter } from "next/navigation";
import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";
import KatoIntroScreen from "@/app/components/KatoIntroScreen";
import CaseInfoModal from "@/app/components/CaseInfoModal";

// Types
import { AgentConfig, SessionStatus } from "@/app/types";

// Context providers & hooks
import { TranscriptProvider, useTranscript } from "@/app/contexts/TranscriptContext";
import { EventProvider, useEvent } from "@/app/contexts/EventContext";
import { useEventBus, EventBusProvider } from "@/app/contexts/EventBusContext"; 

// Utilities
import { katoCaseDetails } from "@/app/cases/kato/katoCaseData";
import { KatoEvents } from "@/app/cases/kato/KatoEvents";
import * as Payloads from "@/app/cases/kato/KatoEventPayloads"; // ADD for payload types

// Specific Agent config
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

// Hooks
import useAudioDownload from "@/app/hooks/useAudioDownload";
// import { useKatoRTC } from "@/app/hooks/useKatoRTC"; // No longer direct
// import { useAgentManager } from "@/app/hooks/useAgentManager"; // No longer direct
import { useIntroAudio } from "@/app/hooks/useIntroAudio";

// NEW CONTEXT HOOKS
// import { useKatoRTCContext } from "@/app/contexts/KatoRTCContext"; // REMOVE
// import { useAgentContext } from "@/app/contexts/AgentContext"; // REMOVE
import { useAgentLifecycle } from "@/app/contexts/AgentLifecycleContext"; // ADD

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// createServerEventHandler is now in KatoRTCContext.tsx

function KatoTextPageContent() {
  const eventBus = useEventBus();
  const router = useRouter();
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent } = useEvent();
  const { 
    state: machineState, 
    send, 
    isLoading: isAgentMachineLoading,
    isSwitchingInProgress: isAgentMachineSwitching
  } = useAgentLifecycle();

  const { 
    sessionStatus, 
    currentAgentConfig, 
    selectedAgentName, 
    error: machineError,
    isAudioPlaybackEnabled,
    dc
  } = machineState.context;

  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(!currentAgentConfig);
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(true);
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<Payloads.AudioInputModeChangedPayload['mode']>("ptt");
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState<boolean>(false);
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [isFunctionCallInProgress, setIsFunctionCallInProgress] = useState<boolean>(false);

  const { downloadRecording } = useAudioDownload();
  const { isIntroAudioPlaying } = useIntroAudio({ addTranscriptBreadcrumb });
  const introButtonClickedRef = useRef(false);

  useEffect(() => {
    setShowIntroScreen(!currentAgentConfig);
    if (currentAgentConfig) {
      introButtonClickedRef.current = false;
    }
  }, [currentAgentConfig]);

  useEffect(() => {
    const handleConnectionEstablished = () => addTranscriptBreadcrumb("Data channel open.");
    const handleConnectionFailed = (data: Payloads.ConnectionFailedPayload) => {
      addTranscriptBreadcrumb(`Error connecting: ${data.error.message}`);
    };
    const handleDataChannelStatus = (data: Payloads.DataChannelStatusChangedPayload) => {
      if (data.status === 'closed') addTranscriptBreadcrumb("Data channel closed.");
      if (data.status === 'error') addTranscriptBreadcrumb("Data channel error.");
    };
    const subEst = eventBus.on(KatoEvents.CONNECTION_ESTABLISHED, handleConnectionEstablished);
    const subFail = eventBus.on(KatoEvents.CONNECTION_FAILED, handleConnectionFailed);
    const subDc = eventBus.on(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, handleDataChannelStatus);
    return () => { subEst(); subFail(); subDc(); };
  }, [eventBus, addTranscriptBreadcrumb]);

  const cancelAssistantSpeechLogic = useCallback(() => {
    const mostRecentAssistantMessage = transcriptItems.findLast((item) => item.role === "assistant");
    if (mostRecentAssistantMessage?.status === "IN_PROGRESS" || isOutputAudioBufferActive) {
      // This KatoEvent is for wider system, machine might listen to it too.
      eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH);
    }
  }, [transcriptItems, isOutputAudioBufferActive, eventBus]);
  
  useEffect(() => {
    // For UI optimistic update if needed, or machine handles transcript update
    const handleUserSentTextMessage = (data: Payloads.UserSentTextMessagePayload) => {
        setUserText(""); // Clear input field
    };
    const sub = eventBus.on(KatoEvents.USER_SENT_TEXT_MESSAGE, handleUserSentTextMessage);
    return () => sub();
  }, [eventBus]);

  // TranscriptContext handles SERVER_TRANSCRIPT_ITEM, so no direct subscription here.

  useEffect(() => {
    // UI listens to this event to update its own state if needed.
    const handleOutputBufferStatus = (isActive: Payloads.OutputAudioBufferStatusChangedPayload['isActive']) => setIsOutputAudioBufferActive(isActive);
    const sub = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleOutputBufferStatus);
    return () => sub();
  }, [eventBus]);

  useEffect(() => {
    const handleVisibilityChange = (isVisible: Payloads.AudioModalVisibilityChangedPayload['isVisible']) => setShowAudioInteractionModal(isVisible);
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
      send({ type: 'USER_CONFIRMED_AUDIO_MODAL' }); // This IS a machine event
    };
    const subConfirmation = eventBus.on(KatoEvents.USER_CONFIRMED_AUDIO_MODAL, handleUserConfirmation);
    return () => { subVisibility(); subConfirmation(); };
  }, [eventBus, send]);

  useEffect(() => {
    const handleTalkStart = () => setIsPTTUserSpeaking(true);
    const handleTalkEnd = () => setIsPTTUserSpeaking(false);
    const subStart = eventBus.on(KatoEvents.USER_REQUESTED_TALK_START, handleTalkStart);
    const subEnd = eventBus.on(KatoEvents.USER_REQUESTED_TALK_END, handleTalkEnd);
    return () => { subStart(); subEnd(); };
  }, [eventBus]);

  const onToggleConnection = useCallback(() => {
    // Use machine context status. Exact state names from machine def would be better.
    if (sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING') {
      send({ type: 'USER_REQUESTED_DISCONNECT' }); // This IS a machine event
    } else {
      if (currentAgentConfig) {
        // Assuming SELECT_AGENT with an existing agent triggers connection process for that agent.
        send({ type: 'SELECT_AGENT', agentName: currentAgentConfig.name });
      } else {
        addTranscriptBreadcrumb("Please select an agent before connecting.");
      }
    }
  }, [send, sessionStatus, currentAgentConfig, addTranscriptBreadcrumb]);

  const handleSendTextMessage = useCallback(() => {
    if (!userText.trim()) return;
    cancelAssistantSpeechLogic(); 
    const messageId = uuidv4().slice(0,32);
    // Emit KatoEvent, machine should subscribe to this if it needs to act (e.g. send to server)
    eventBus.emit(KatoEvents.USER_SENT_TEXT_MESSAGE, { text: userText.trim(), id: messageId });
  }, [userText, eventBus, cancelAssistantSpeechLogic]); 

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    send({ type: 'SELECT_AGENT', agentName: newAgentName }); // This IS a machine event
  }, [send]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dc?.readyState !== "open") return;
    eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH);
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_START);
    // Machine should handle sending this to server if necessary via its SEND_MESSAGE_TO_SERVER subscription
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.clear" }, eventNameSuffix: "clear PTT buffer (text)" });
  }, [sessionStatus, eventBus, dc]);

  const handleTalkButtonUp = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dc?.readyState !== "open" || !isPTTUserSpeaking) return;
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_END);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.commit" }, eventNameSuffix: "commit PTT (text)" });
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "trigger response PTT (text)" });
  }, [sessionStatus, isPTTUserSpeaking, eventBus, dc]);
  
  const handleCreateDDx = useCallback(() => {
    eventBus.emit(KatoEvents.USER_TRIGGERED_CREATE_DDX);
  }, [eventBus]);
  
  useEffect(() => { 
    const handlePttUpdateBasedOnMode = (newMode: Payloads.AudioInputModeChangedPayload['mode']) => {
      setIsPTTActive(newMode === 'ptt');
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handlePttUpdateBasedOnMode);
    // Initial check
    handlePttUpdateBasedOnMode(currentAudioInputMode);
    return () => sub(); 
  }, [eventBus, currentAudioInputMode]);

  const handleAudioInputModeChange = (newMode: Payloads.AudioInputModeChangedPayload['mode']) => {
    eventBus.emit(KatoEvents.USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE, { mode: newMode });
    // Optimistically update local UI state, also listen to AUDIO_INPUT_MODE_CHANGED for canonical changes
    setCurrentAudioInputMode(newMode);
  };

  useEffect(() => {
    const handleModeChanged = (payload: Payloads.AudioInputModeChangedPayload) => setCurrentAudioInputMode(payload.mode);
    const unsub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleModeChanged);
    return () => unsub();
  }, [eventBus]);

  const handleAudioPlaybackEnabledChange = (isEnabled: Payloads.AudioPlaybackEnabledChangedPayload['enabled']) => {
    // Emit KatoEvent, machine or audio service can listen
    eventBus.emit(KatoEvents.USER_TOGGLED_AUDIO_PLAYBACK, { enabled: isEnabled });
  };

  // useEffect for SEND_MESSAGE_TO_SERVER, Initial Session Update, Audio Settings Change, Mic Denied Modal
  // are removed as their logic should now be primarily handled by the XState machine or derived from its state.
  // The machine will use eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, ...) internally.

  const isDisconnectedOrErrorState = sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR";

  // Determine if the main connect button should show a loading/connecting state
  const isConnecting = sessionStatus === "CONNECTING";
  const isConnected = sessionStatus === "CONNECTED";

  // Simplified error display logic, can be expanded
  const errorMessage = typeof machineError === 'string' ? machineError : (machineError && typeof machineError === 'object' && 'message' in machineError ? String(machineError.message) : undefined);

  const showMicDeniedModal = machineState.matches('connectionError') && typeof machineError === 'string' && machineError.toLowerCase().includes('microphone'); // Example logic

  // Patient & Preceptor agents are part of allAgentConfigs, not separate states usually
  // const patientAgentConfig = medicalHistoryTakingAgents.find(a => a.name === "mrKato");
  // const preceptorAgentConfig = medicalHistoryTakingAgents.find(a => a.name === "preceptor");
  const patientAgentConfig = machineState.context.agentConfigs?.find(a => a.name === "mrKato");
  const preceptorAgentConfig = machineState.context.agentConfigs?.find(a => a.name === "preceptor");


  const handleStartWithPatient = () => {
    if (patientAgentConfig) {
      send({ type: 'SELECT_AGENT', agentName: patientAgentConfig.name });
    } else {
      addTranscriptBreadcrumb("Patient agent configuration not found.");
    }
  };

  const handleStartWithPreceptor = () => {
    if (preceptorAgentConfig) {
      send({ type: 'SELECT_AGENT', agentName: preceptorAgentConfig.name });
    } else {
      addTranscriptBreadcrumb("Preceptor agent configuration not found.");
    }
  };

  // Effect for TOOL_CALL_STARTED and TOOL_CALL_COMPLETED
  useEffect(() => {
    const handleToolCallStarted = (data: Payloads.ToolCallStartedPayload) => {
      console.log(`[KatoTextPage] Tool call started: ${data.functionName} (${data.callId || 'N/A'})`);
      setIsFunctionCallInProgress(true);
    };
    const handleToolCallCompleted = (data: Payloads.ToolCallCompletedPayload) => {
      console.log(`[KatoTextPage] Tool call completed: ${data.functionName} (${data.callId || 'N/A'}), Success: ${data.success}`);
      setIsFunctionCallInProgress(false);
    };

    const unsubStarted = eventBus.on(KatoEvents.TOOL_CALL_STARTED, handleToolCallStarted);
    const unsubCompleted = eventBus.on(KatoEvents.TOOL_CALL_COMPLETED, handleToolCallCompleted);

    return () => {
      unsubStarted();
      unsubCompleted();
    };
  }, [eventBus]);

  if (showIntroScreen) {
    return (
      <KatoIntroScreen
        // caseDetails={katoCaseDetails.textCase} // REMOVE - Component uses internal data
        onStartWithPatient={handleStartWithPatient}
        onStartWithPreceptor={handleStartWithPreceptor}
        // currentAgentConfig={currentAgentConfig} // REMOVE - Component does not take this
        // isConnecting={isConnecting} // REMOVE - Component does not take this
        // onSelectAgent={handleAvatarAgentSelect} // REMOVE - Component does not take this
        // agents={medicalHistoryTakingAgents} // REMOVE - Component does not take this
      />
    );
  }
  
  const canSendTranscriptMessage = sessionStatus === "CONNECTED" && dc?.readyState === "open";

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white relative">
      {/* Header */}
      <header className="bg-gray-800 p-3 flex justify-between items-center shadow-md">
        <div className="flex items-center">
          <Image src="/logos/kato-logo-final.png" alt="Kato Logo" width={32} height={32} />
          <h1 className="text-xl font-semibold ml-2">Kato (Text Interface)</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsCaseInfoModalOpen(true)} 
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
            title="Show Case Info"
          >
            <LuInfo size={20} />
          </button>
          <select
            value={selectedAgentName || ""}
            onChange={(e) => handleAvatarAgentSelect(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            disabled={isConnecting || isConnected || isAgentMachineSwitching}
          >
            <option value="" disabled>Select Agent</option>
            {machineState.context.agentConfigs?.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.displayName || agent.name}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleConnection}
            className={`px-4 py-2 rounded-md font-semibold text-sm 
                        ${isConnected ? "bg-red-600 hover:bg-red-700" : 
                         isConnecting ? "bg-yellow-500 cursor-not-allowed" : 
                                        "bg-green-600 hover:bg-green-700"}
                        disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            disabled={isConnecting || (!isConnected && !currentAgentConfig) || isAgentMachineSwitching}
          >
            {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </header>

      {/* Main Content Area - Now primarily the Transcript component */}
      <main className="flex-1 flex flex-col p-4">
        <Transcript 
          onSendText={async (text) => {
            cancelAssistantSpeechLogic(); // Interrupt assistant if they are speaking
            eventBus.emit(KatoEvents.USER_SENT_TEXT_MESSAGE, { text, id: uuidv4().slice(0,32) });
          }}
          onSendAudio={(audioBlob, durationMillis) => { /* Not used in text page currently */ }}
          currentUserInput={userText}
          setCurrentUserInput={setUserText}
          currentAgentName={currentAgentConfig?.displayName || currentAgentConfig?.name}
          isAgentLoading={isAgentMachineLoading}
          isSwitchingAgent={isAgentMachineSwitching}
          isFunctionCallInProgress={isFunctionCallInProgress}
          userResponseSuggestions={[]}
          audioInputMode={currentAudioInputMode}
          micAccessError={!!(machineState.matches('connectionError') && typeof machineError === 'string' && machineError.toLowerCase().includes('microphone'))}
          onMicAccessError={() => { /* TODO: Potentially send event to machine */ }}
          onMicAccessRecovered={() => { /* TODO: Potentially send event to machine */ }}
        />
      </main>

      {/* Modals */}
      <CaseInfoModal 
        isOpen={isCaseInfoModalOpen} 
        onClose={() => setIsCaseInfoModalOpen(false)} 
        // caseDetails={katoCaseDetails.textCase} // REMOVE - Component uses internal data
      />

      {/* Audio Element (Hidden) - if ever needed for text page audio alerts or minimal playback */}
      {/* <audio ref={audioElementRef} className="hidden" /> */}

      {/* Audio Interaction Modal - if needed */}
      {showAudioInteractionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl text-center">
            <h3 className="text-lg font-semibold mb-4">Audio Interaction Required</h3>
            <p className="mb-4 text-sm">Please click below to enable audio.</p>
            <button 
              onClick={() => eventBus.emit(KatoEvents.USER_CONFIRMED_AUDIO_MODAL)} // Machine will receive this via its own subscription or direct send
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md text-sm font-semibold transition-colors"
            >
              Enable Audio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KatoTextPage() {
  return (
    <EventBusProvider>
      <TranscriptProvider>
        <EventProvider>
          {/* AgentLifecycleProvider is in the root layout */}
          <KatoTextPageContent />
        </EventProvider>
      </TranscriptProvider>
    </EventBusProvider>
  );
} 
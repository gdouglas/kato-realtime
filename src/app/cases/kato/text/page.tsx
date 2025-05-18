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

// Specific Agent config
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

// Hooks
import useAudioDownload from "@/app/hooks/useAudioDownload";
// import { useKatoRTC } from "@/app/hooks/useKatoRTC"; // No longer direct
// import { useAgentManager } from "@/app/hooks/useAgentManager"; // No longer direct
import { useIntroAudio } from "@/app/hooks/useIntroAudio";

// NEW CONTEXT HOOKS
import { useKatoRTCContext } from "@/app/contexts/KatoRTCContext";
import { useAgentContext } from "@/app/contexts/AgentContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// createServerEventHandler is now in KatoRTCContext.tsx

function KatoTextPageContent() {
  const eventBus = useEventBus();
  const router = useRouter();
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent } = useEvent();

  // Get state and functions from CONTEXTS
  const { 
    sessionStatus, 
    dcRef, 
    manualDisconnect, 
    isAudioPlaybackEnabled, 
    setIsAudioPlaybackEnabled 
  } = useKatoRTCContext();

  const { 
    selectedAgentName, 
    currentAgentConfig, 
    patientAgent,
    preceptorAgent,
    selectAgent 
  } = useAgentContext();

  // const urlCodec = "opus"; // Managed in KatoRTCContext
  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(true);
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null); 
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(true); // Text mode defaults to PTT active
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<"conversation" | "ptt" | "no_mic">("ptt"); // Default to PTT for text mode
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState<boolean>(false);
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [showMicDeniedModal, setShowMicDeniedModal] = useState<boolean>(false);

  const hasDoneInitialAgentSetupRef = useRef<boolean>(false);
  const isInitialAgentConnectionRef = useRef<boolean>(true);
  
  const { downloadRecording } = useAudioDownload(); // start/stop recording not directly used by UI
  // const handleServerEventRef = useRef(createServerEventHandler(eventBus)); // Moved to KatoRTCContext

  const { isIntroAudioPlaying } = useIntroAudio({
    addTranscriptBreadcrumb
  });

  const introButtonClickedRef = useRef(false);

  // --- Event Subscriptions & Logic (Adapted for Text Page) ---
  useEffect(() => {
    if (selectedAgentName) {
      setShowIntroScreen(false);
    } else {
      // No agent selected yet (e.g. initial load or after a reset)
      setShowIntroScreen(true);
      introButtonClickedRef.current = false; // Reset for a fresh intro sequence
    }
  }, [selectedAgentName]);

  useEffect(() => {
    const handleAgentChangedPageLogic = () => hasDoneInitialAgentSetupRef.current = false;
    const subChange = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChangedPageLogic);
    return () => subChange();
  }, [eventBus]); 

  useEffect(() => {
    const handleConnectionEstablished = () => addTranscriptBreadcrumb("Data channel open.");
    const handleConnectionFailed = (error: Error) => {
      addTranscriptBreadcrumb(`Error connecting: ${error.message}`);
      eventBus.emit(KatoEvents.SESSION_STATUS_CHANGED, "ERROR"); 
    };
    const handleDataChannelStatus = (status: 'open' | 'closed' | 'error') => {
        if (status === 'closed') addTranscriptBreadcrumb("Data channel closed.");
        if (status === 'error') addTranscriptBreadcrumb("Data channel error.");
        if (status === 'closed' && sessionStatus === 'CONNECTED' && !manualDisconnect) { 
            eventBus.emit(KatoEvents.SESSION_STATUS_CHANGED, "DISCONNECTED"); 
        }
    };
    const subEst = eventBus.on(KatoEvents.CONNECTION_ESTABLISHED, handleConnectionEstablished);
    const subFail = eventBus.on(KatoEvents.CONNECTION_FAILED, handleConnectionFailed);
    const subDc = eventBus.on(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, handleDataChannelStatus);
    return () => { subEst(); subFail(); subDc(); };
  }, [eventBus, addTranscriptBreadcrumb, sessionStatus, manualDisconnect]); 

  useEffect(() => {
    const performUpdateSession = (data?: { shouldTriggerResponse?: boolean }) => {
        if (!currentAgentConfig) return;
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
            eventObj: { type: "input_audio_buffer.clear" },
            eventNameSuffix: "clear audio buffer on session update (text page)"
        });
        let turnDetectionConfig: any = null;
        let modalitiesConfig = ["text", "audio"];
        let transcriptionConfig: any = { model: "whisper-1", language: "en" };

        if (currentAudioInputMode === "no_mic") {
          modalitiesConfig = ["text"];
          transcriptionConfig = null;
        } else if (currentAudioInputMode === "conversation" && !isPTTActive) { // VAD only if PTT is OFF
          turnDetectionConfig = {
            type: "server_vad", threshold: 0.5, prefix_padding_ms: 300,
            silence_duration_ms: 200, create_response: true,
          };
        } // If PTT is active (currentAudioInputMode is 'ptt'), turn_detection remains null

        const sessionUpdateEvent = {
          type: "session.update",
          session: {
            modalities: modalitiesConfig,
            instructions: currentAgentConfig.instructions || "",
            voice: currentAgentConfig.voice || "sage",
            input_audio_transcription: transcriptionConfig,
            turn_detection: turnDetectionConfig,
            tools: currentAgentConfig.tools || [],
          },
        };
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: sessionUpdateEvent, eventNameSuffix: "session.update (text page)" });
        if (data?.shouldTriggerResponse) {
            const id = uuidv4().slice(0, 32);
            addTranscriptMessage(id, "user", "Hi", true);
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
                eventObj: { type: "conversation.item.create", item: { id, type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] } },
                eventNameSuffix: "(simulated hi for agent switch - text page)"
            });
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response after agent switch - text page)" });
        }
    };
    return eventBus.on(KatoEvents.SESSION_UPDATE_REQUESTED, performUpdateSession);
  }, [eventBus, currentAgentConfig, currentAudioInputMode, isPTTActive, addTranscriptMessage]);

  const cancelAssistantSpeechLogic = useCallback(() => {
    const mostRecentAssistantMessage = transcriptItems.findLast((item) => item.role === "assistant");
    if (mostRecentAssistantMessage?.status === "IN_PROGRESS") {
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.cancel" }, eventNameSuffix: "(cancel due to user text - text page)"});
    }
    if (isOutputAudioBufferActive) { 
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "output_audio_buffer.clear" }, eventNameSuffix: "(cancel due to user text - text page)"});
    }
  }, [transcriptItems, eventBus, isOutputAudioBufferActive]);
  
  useEffect(() => {
    const handleSend = (data: { text: string, id: string }) => {
        addTranscriptMessage(data.id, "user", data.text, false); 
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
            eventObj: {
        type: "conversation.item.create",
                item: { id: data.id, type: "message", role: "user", content: [{ type: "input_text", text: data.text }] },
            },
            eventNameSuffix: "(send user text message - text page)"
        });
        setUserText("");
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response - text page)" });
    };
    return eventBus.on(KatoEvents.USER_SENT_TEXT_MESSAGE, handleSend);
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    const handleServerTranscript = (data: { idToAssign: string, role: 'user' | 'assistant', title: string, isLocal?: boolean }) => {
        addTranscriptMessage(data.idToAssign, data.role, data.title, data.isLocal);
    };
    return eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM, handleServerTranscript);
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    return eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, setIsOutputAudioBufferActive);
  }, [eventBus]);

  useEffect(() => {
    const handleVisibilityChange = (isVisible: boolean) => setShowAudioInteractionModal(isVisible);
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
      eventBus.emit(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, false); 
    };
    const subConfirmation = eventBus.on(KatoEvents.USER_CONFIRMED_AUDIO_MODAL, handleUserConfirmation);
    return () => { subVisibility(); subConfirmation(); };
  }, [eventBus]);

  useEffect(() => {
    const handleTalkStart = () => setIsPTTUserSpeaking(true);
    const handleTalkEnd = () => setIsPTTUserSpeaking(false);
    const subStart = eventBus.on(KatoEvents.USER_REQUESTED_TALK_START, handleTalkStart);
    const subEnd = eventBus.on(KatoEvents.USER_REQUESTED_TALK_END, handleTalkEnd);
    return () => { subStart(); subEnd(); };
  }, [eventBus]);

  const onToggleConnection = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT);
    } else {
      if (currentAgentConfig) eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      else addTranscriptBreadcrumb("Please select an agent before connecting.");
    }
  }, [eventBus, sessionStatus, currentAgentConfig, addTranscriptBreadcrumb]);

  const handleSendTextMessage = useCallback(() => {
    if (!userText.trim()) return;
    cancelAssistantSpeechLogic(); 
    const messageId = uuidv4().slice(0,32);
    eventBus.emit(KatoEvents.USER_SENT_TEXT_MESSAGE, { text: userText.trim(), id: messageId });
  }, [userText, eventBus, cancelAssistantSpeechLogic]); 

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    selectAgent(newAgentName); // Use context function
  }, [selectAgent]);

  useEffect(() => {
    return eventBus.on(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH, cancelAssistantSpeechLogic);
  }, [eventBus, cancelAssistantSpeechLogic]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open") return;
    eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH); // Relevant if audio was playing
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_START);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.clear" }, eventNameSuffix: "clear PTT buffer (text)" });
  }, [sessionStatus, eventBus, dcRef]);

  const handleTalkButtonUp = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open" || !isPTTUserSpeaking) return;
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_END);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.commit" }, eventNameSuffix: "commit PTT (text)" });
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "trigger response PTT (text)" });
  }, [sessionStatus, isPTTUserSpeaking, eventBus, dcRef]);
  
  const handleCreateDDx = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      addTranscriptBreadcrumb("Disconnecting session before navigating to DDx page...");
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, {isSwitchingAgent: false}); 
    }
    router.push('/cases/kato/ddx');
  }, [router, sessionStatus, eventBus, addTranscriptBreadcrumb]);
  
  useEffect(() => { // PTT Active State based on Audio Input Mode
    const handleAudioInputModeChange = (newMode: 'conversation' | 'ptt' | 'no_mic') => {
      setIsPTTActive(newMode === 'ptt');
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    setIsPTTActive(currentAudioInputMode === 'ptt'); // Initialize
    return () => sub();
  }, [eventBus, currentAudioInputMode]);

  useEffect(() => { // Audio Input Mode
    const handleAudioInputModeChange = (newMode: "conversation" | "ptt" | "no_mic") => setCurrentAudioInputMode(newMode);
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    return () => sub();
  }, [eventBus]);

  useEffect(() => { // Audio Playback Enabled
    const handleAudioPlaybackEnabledChange = (isEnabled: boolean) => {
      setIsAudioPlaybackEnabled(isEnabled);
      if (audioElementRef.current) audioElementRef.current.autoplay = isEnabled;
    };
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handleAudioPlaybackEnabledChange);
    return () => sub();
  }, [eventBus]);

  useEffect(() => { // SEND_MESSAGE_TO_SERVER Handler
    const handleSendMessageToServer = (data: { eventObj: any, eventNameSuffix?: string }) => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        const messagePayload = JSON.stringify(data.eventObj);
        // Simplified log for text page as voice/instructions less directly relevant to send action itself
        logClientEvent(data.eventObj, data.eventNameSuffix); 
        dcRef.current.send(messagePayload);
      } else {
        console.error(`[MESSAGE_SENT_TO_DC_ERROR_TEXT] DC not open. Event: ${data.eventObj.type}`);
        addTranscriptBreadcrumb("Error: Data channel not open.");
        logClientEvent({ attemptedEvent: data.eventObj.type, error: "dc_not_open" }, `error.dc_not_open_for_${data.eventNameSuffix || 'unknown_event'}`);
      }
    };
    const unsubscribe = eventBus.on(KatoEvents.SEND_MESSAGE_TO_SERVER, handleSendMessageToServer);
    return () => unsubscribe();
  }, [eventBus, dcRef, logClientEvent, addTranscriptBreadcrumb]);

  useEffect(() => { // Initial Session Update
    if (sessionStatus === "CONNECTED" && currentAgentConfig && !hasDoneInitialAgentSetupRef.current) {
      addTranscriptBreadcrumb(`Agent ${currentAgentConfig.name} ready (Text Page).`);
      eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { shouldTriggerResponse: !isInitialAgentConnectionRef.current });
      if (isInitialAgentConnectionRef.current) isInitialAgentConnectionRef.current = false;
      hasDoneInitialAgentSetupRef.current = true;
    }
  }, [sessionStatus, currentAgentConfig, eventBus, addTranscriptBreadcrumb]);

  useEffect(() => { // Audio Settings Change
    const handleAudioSettingsChange = () => {
        if(sessionStatus === "CONNECTED" && currentAgentConfig) {
            eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { shouldTriggerResponse: false });
        }
    };
    if (sessionStatus === "CONNECTED" && currentAgentConfig) { 
        handleAudioSettingsChange();
    }
  }, [isPTTActive, currentAudioInputMode, sessionStatus, eventBus, currentAgentConfig]);

  useEffect(() => { // Mic Denied Modal
    const showModal = () => setShowMicDeniedModal(true);
    const sub = eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, showModal);
    return () => sub();
  }, [eventBus]);

  const isDisconnectedOrErrorState = sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR";

  const handleStartWithPatient = () => {
    introButtonClickedRef.current = true;
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: "mrKato" });
    setShowIntroScreen(false);
  };

  const handleStartWithPreceptor = () => {
    introButtonClickedRef.current = true;
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: "preceptor" });
    setShowIntroScreen(false);
  };

  if (showIntroScreen) {
    return <KatoIntroScreen onStartWithPatient={handleStartWithPatient} onStartWithPreceptor={handleStartWithPreceptor} />;
  }
  
  const canSendTranscriptMessage = sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open";

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      {/* Header - Consistent across pages */}
      <div className="p-4 text-lg font-semibold flex justify-between items-center border-b bg-white shadow-sm">
        <div className="flex items-center">
          <Image src="/logos/UBC-crest-blue.png" alt="UBC Logo" width={48} height={48} className="mr-3"/>
          <span className="text-gray-500 font-medium text-lg mr-2 ml-2 h-full border-l border-gray-300">&nbsp;</span>
          <span className="font-bold text-xl flex items-center">
            {katoCaseDetails.mainTitle}
            <LuInfo 
              size={20} 
              className="ml-2 text-blue-500 cursor-pointer hover:text-blue-700 transition-colors"
              onClick={() => setIsCaseInfoModalOpen(true)}
              title="View case information"
            />
          </span>
        </div>
        <div className="text-sm text-gray-700">
          {currentAgentConfig ? (
            <>
              <span className="font-medium">{currentAgentConfig.publicDescription}</span>
              {sessionStatus === "CONNECTED" && <span className="ml-2 text-green-600">(Connected)</span>}
              {sessionStatus === "CONNECTING" && <span className="ml-2 text-yellow-600">(Connecting...)</span>}
              {isDisconnectedOrErrorState && !manualDisconnect && selectedAgentName && <span className="ml-2 text-gray-500">(Disconnected)</span>}
              {manualDisconnect && <span className="ml-2 text-red-600">(Manually Disconnected)</span>}
            </>
          ) : "No agent selected"}
        </div>
      </div>

      {/* Main Content - Text/Transcript UI Only */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {showMicDeniedModal && (
            <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
                <h3 className="text-xl font-semibold mb-4">Mic Access Denied</h3>
                <p className="mb-6">Mic access denied. You can still use text input, or update browser permissions.</p>
                <button onClick={() => setShowMicDeniedModal(false)} className="px-8 py-3 bg-blue-500 text-white rounded-lg">OK</button>
                </div>
            </div>
        )}
        {showAudioInteractionModal && (
             <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
                <h3 className="text-xl font-semibold mb-4">Audio Interaction</h3>
                <p className="mb-6">This app works best with audio. Please enable your microphone and speakers.</p>
                <button onClick={() => eventBus.emit(KatoEvents.USER_CONFIRMED_AUDIO_MODAL)} className="px-8 py-3 bg-blue-500 text-white rounded-lg">Let\'s Get Started!</button>
                </div>
            </div>
        )}

        {/* Text/Transcript UI */}
        <div className="w-full h-full flex flex-col bg-white rounded-lg shadow">
          <Transcript 
            userText={userText} 
            setUserText={setUserText} 
            onSendMessage={handleSendTextMessage} 
            downloadRecording={downloadRecording}
            canSend={canSendTranscriptMessage}
            selectedAgentName={selectedAgentName}
            patientAgent={patientAgent || null}
            preceptorAgent={preceptorAgent || null}
            handleAvatarAgentSelect={handleAvatarAgentSelect} // Still needed for agent switching from transcript
          />
          {/* PTT button for Text Mode (if PTT mode is active) */}
          {currentAudioInputMode === 'ptt' && (
            <div className="p-4 flex justify-center items-center bg-gray-50">
              <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50`}
                disabled={sessionStatus !== "CONNECTED"} > {isPTTUserSpeaking ? "Listening..." : "Push to Talk"} </button>
            </div>
          )}
          <div className="p-3 flex flex-col sm:flex-row justify-between items-center border-t bg-gray-50 space-y-2 sm:space-y-0 sm:space-x-2">
            <div className="flex space-x-2">
              <button onClick={() => eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "conversation")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentAudioInputMode === "conversation" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"} disabled:opacity-50`} disabled={sessionStatus !== "CONNECTED"}>Conversation</button>
              <button onClick={() => eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "ptt")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentAudioInputMode === "ptt" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"} disabled:opacity-50`} disabled={sessionStatus !== "CONNECTED"}>Push to Talk</button>
              <button onClick={() => eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "no_mic")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentAudioInputMode === "no_mic" ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"} disabled:opacity-50`} disabled={sessionStatus !== "CONNECTED"}>No Mic</button>
            </div>
            <label className="flex items-center cursor-pointer select-none">
              <input type="checkbox" checked={isAudioPlaybackEnabled} onChange={(e) => setIsAudioPlaybackEnabled(e.target.checked)} className="sr-only peer" />
              <div className="relative w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              <span className="ms-3 text-sm font-medium text-gray-800">Audio Playback</span>
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Toolbar - Consistent across pages, but nav button changes */}
      <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4">
        <div></div> 
        <div className="flex items-center space-x-4"> 
          <button onClick={onToggleConnection}
            className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"} focus:outline-none focus:ring-2 disabled:opacity-50`}
            disabled={!currentAgentConfig && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")} >
            {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "Disconnect" : "Connect"}
          </button>
          <button onClick={() => router.push('/cases/kato/speak')} // Navigate to speak page
            className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2"> Speak </button>
        </div>
        <div> 
          <button onClick={handleCreateDDx}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2">
            Create a DDx
          </button>
        </div>
      </div>
      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
    </div>
  );
}

export default function KatoTextPage() { 
  return (
    <KatoTextPageContent />
  );
} 
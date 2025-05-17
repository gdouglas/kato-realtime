"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { LuWifiOff, LuLoader, LuInfo } from "react-icons/lu";
import { useRouter } from "next/navigation";
import Image from "next/image";

// UI components
// import Transcript from "@/app/components/Transcript"; // Not used directly in speak page
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
import { useIntroAudio } from "@/app/hooks/useIntroAudio";

// NEW CONTEXT HOOKS
import { useKatoRTCContext } from "@/app/contexts/KatoRTCContext";
import { useAgentContext } from "@/app/contexts/AgentContext";

// KatoPageLayout is not used; layout is inline

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function KatoSpeakPageContent() {
  const eventBus = useEventBus();
  const router = useRouter();
  const { addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript(); // transcriptItems not directly used in layout
  const { logClientEvent } = useEvent(); // logServerEvent not directly used here

  // Get state and functions from CONTEXTS
  const { 
    sessionStatus, 
    dcRef, 
    manualDisconnect, 
    isAudioPlaybackEnabled, 
    setIsAudioPlaybackEnabled, // Use this to control playback
  } = useKatoRTCContext();

  const { 
    selectedAgentName, 
    currentAgentConfig, 
    patientAgent,
    preceptorAgent,
    selectAgent // Use this to change agent
  } = useAgentContext();

  const urlCodec = "opus";

  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(true);
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);

  const audioElementRef = useRef<HTMLAudioElement | null>(null); 
  // userText and setUserText are not needed for speak page UI directly
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false); // Default for avatar mode is VAD (isPTTActive=false)
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<"conversation" | "ptt" | "no_mic">("conversation");
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState<boolean>(false);
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [showMicDeniedModal, setShowMicDeniedModal] = useState<boolean>(false);

  const linePositioningParentRef = useRef<HTMLDivElement>(null);
  const userAvatarCircleRef = useRef<HTMLDivElement>(null);
  const patientAvatarCircleRef = useRef<HTMLDivElement>(null);
  const preceptorAvatarCircleRef = useRef<HTMLDivElement>(null);
  const indicatorLineRef = useRef<HTMLDivElement>(null);
  const [isLineRefReady, setIsLineRefReady] = useState(false);
  const [indicatorTargets, setIndicatorTargets] = useState({ user: 0, agent: 0 });
  const [activeSpeakerTurn, setActiveSpeakerTurn] = useState<"user" | "patient" | "preceptor" | "none">("none");
  const [isUserActuallySpeaking, setIsUserActuallySpeaking] = useState<boolean>(false);

  const hasDoneInitialAgentSetupRef = useRef<boolean>(false);
  const isInitialAgentConnectionRef = useRef<boolean>(true);
  
  // useAudioDownload hook is not directly used by UI buttons on this page.

  const { isIntroAudioPlaying } = useIntroAudio({
    addTranscriptBreadcrumb,
    sessionStatus, 
    manualDisconnect, 
    currentAgentConfig, 
  });

  const introButtonClickedRef = useRef(false);

  // Ref callback for the indicator line
  const indicatorLineRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      indicatorLineRef.current = node; // Ensure the main ref is also populated
      console.log("[SpeakPage] indicatorLineRefCallback: Node ATTACHED.");
      setIsLineRefReady(true);
    } else {
      // Node is detached (e.g., when sessionStatus is no longer CONNECTED)
      console.log("[SpeakPage] indicatorLineRefCallback: Node DETACHED.");
      setIsLineRefReady(false);
    }
  }, []); // Empty dependency array as the callback's logic itself doesn't depend on component state/props

  // --- Event Subscriptions for State Updates & Side Effects (Copied, review for speak-page specifics) ---

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
    const handleAgentChangedPageLogic = () => { // Data param removed as not used
      hasDoneInitialAgentSetupRef.current = false;
    };
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
            eventNameSuffix: "clear audio buffer on session update (speak page)"
        });
        let turnDetectionConfig: any = null;
        let modalitiesConfig = ["text", "audio"];
        let transcriptionConfig: any = { model: "whisper-1", language: "en" };

        // Speak page defaults to conversation mode unless PTT is activated
        if (currentAudioInputMode === "no_mic") { // Though less likely primary for speak page
          modalitiesConfig = ["text"];
          transcriptionConfig = null;
        } else if (currentAudioInputMode === "conversation") {
          turnDetectionConfig = {
            type: "server_vad", threshold: 0.5, prefix_padding_ms: 300,
            silence_duration_ms: 200, create_response: true,
          };
        } // PTT mode (turn_detection: null) is handled if currentAudioInputMode becomes 'ptt'

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
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: sessionUpdateEvent, eventNameSuffix: "session.update (speak page)" });
        if (data?.shouldTriggerResponse) {
            const id = uuidv4().slice(0, 32);
            addTranscriptMessage(id, "user", "Hi", true); // This still goes to transcript context
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
                eventObj: { type: "conversation.item.create", item: { id, type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] } },
                eventNameSuffix: "(simulated hi for agent switch - speak page)"
            });
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response after agent switch - speak page)" });
        }
    };
    return eventBus.on(KatoEvents.SESSION_UPDATE_REQUESTED, performUpdateSession);
  }, [eventBus, currentAgentConfig, currentAudioInputMode, addTranscriptMessage]);

  const cancelAssistantSpeechLogic = useCallback(() => {
    // Logic to find recent assistant message from transcriptItems is problematic if transcriptItems isn't used/passed
    // Assuming transcript is managed globally, useTranscript() will provide it.
    // For now, relying on the event to be handled by a global transcript manager if needed,
    // or just clearing buffers.
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.cancel" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    if (isOutputAudioBufferActive) { 
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "output_audio_buffer.clear" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    }
  }, [eventBus, isOutputAudioBufferActive]); // Removed transcriptItems dependency

  useEffect(() => { // For receiving server messages to transcript
    const handleServerTranscript = (data: { idToAssign: string, role: 'user' | 'assistant', title: string, isLocal?: boolean}) => {
        addTranscriptMessage(data.idToAssign, data.role, data.title, data.isLocal);
    };
    return eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM, handleServerTranscript);
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    const handleOutputBufferStatusChanged = (isActive: boolean) => {
      console.log("[SpeakPage] Event: OUTPUT_AUDIO_BUFFER_STATUS_CHANGED received. isActive:", isActive);
      setIsOutputAudioBufferActive(isActive);
    };
    const sub = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleOutputBufferStatusChanged);
    return () => sub();
  }, [eventBus]);

  useEffect(() => { // Audio Interaction Modal
    const handleVisibilityChange = (isVisible: boolean) => setShowAudioInteractionModal(isVisible);
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
      eventBus.emit(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, false); 
    };
    const subConfirmation = eventBus.on(KatoEvents.USER_CONFIRMED_AUDIO_MODAL, handleUserConfirmation);
    return () => { subVisibility(); subConfirmation(); };
  }, [eventBus]);

  useEffect(() => { // PTT Speaking State
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
      if (currentAgentConfig) { 
        eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
      } else {
        addTranscriptBreadcrumb("Please select an agent before connecting.");
      }
    }
  }, [eventBus, sessionStatus, currentAgentConfig, addTranscriptBreadcrumb]);

  // handleSendTextMessage is not for this page's primary UI
  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    selectAgent(newAgentName);
  }, [selectAgent]);

  useEffect(() => {
    return eventBus.on(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH, cancelAssistantSpeechLogic);
  }, [eventBus, cancelAssistantSpeechLogic]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open") return;
    eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH);
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_START);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.clear" }, eventNameSuffix: "clear PTT buffer (speak)" });
  }, [sessionStatus, eventBus, dcRef]); // Added dcRef

  const handleTalkButtonUp = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open" || !isPTTUserSpeaking) return;
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_END);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.commit" }, eventNameSuffix: "commit PTT (speak)" });
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "trigger response PTT (speak)" });
  }, [sessionStatus, isPTTUserSpeaking, eventBus, dcRef]); // Added dcRef
  
  const handleCreateDDx = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      addTranscriptBreadcrumb("Disconnecting session before navigating to DDx page...");
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, {isSwitchingAgent: false}); 
    }
    router.push('/cases/kato/ddx');
  }, [router, sessionStatus, eventBus, addTranscriptBreadcrumb]);

  useEffect(() => { 
    console.log("[SpeakPage] Recalculate effect triggered. showIntroScreen:", showIntroScreen, "currentAgent:", currentAgentConfig?.name, "sessionStatus:", sessionStatus, "isLineRefReady:", isLineRefReady);
    const calculatePositions = () => {
      console.log("[SpeakPage] Attempting to calculatePositions. Refs:", 
        {
          parent: !!linePositioningParentRef.current,
          user: !!userAvatarCircleRef.current,
          patient: !!patientAvatarCircleRef.current,
          preceptor: !!preceptorAvatarCircleRef.current,
          line: !!indicatorLineRef.current
        }
      );
      const parentEl = linePositioningParentRef.current;
      const userCircleEl = userAvatarCircleRef.current;
      const lineEl = indicatorLineRef.current;
      let activeAgentCircleEl: HTMLDivElement | null = null;

      if (currentAgentConfig?.name === patientAgent?.name) activeAgentCircleEl = patientAvatarCircleRef.current;
      else if (currentAgentConfig?.name === preceptorAgent?.name) activeAgentCircleEl = preceptorAvatarCircleRef.current;
      
      if (parentEl && userCircleEl && activeAgentCircleEl && lineEl) {
        const parentRect = parentEl.getBoundingClientRect();
        const userCircleRect = userCircleEl.getBoundingClientRect();
        const agentCircleRect = activeAgentCircleEl.getBoundingClientRect();
        const actualIndicatorWidth = lineEl.getBoundingClientRect().width;

        if (parentRect.width === 0 || userCircleRect.width === 0 || agentCircleRect.width === 0 || actualIndicatorWidth === 0) {
            console.warn("[SpeakPage] calculatePositions: Zero dimension detected. parentW:", parentRect.width, "userW:", userCircleRect.width, "agentW:", agentCircleRect.width, "lineW:", actualIndicatorWidth);
            return; 
        }
        const userCircleCenterX = (userCircleRect.left - parentRect.left) + (userCircleRect.width / 2);
        const userIndicatorX = userCircleCenterX - (actualIndicatorWidth / 2);
        const agentCircleCenterX = (agentCircleRect.left - parentRect.left) + (agentCircleRect.width / 2);
        const agentIndicatorX = agentCircleCenterX - (actualIndicatorWidth / 2);
        
        console.log("[SpeakPage] Successfully calculated positions:", { userIndicatorX, agentIndicatorX });
        setIndicatorTargets({ user: userIndicatorX, agent: agentIndicatorX });
      } else {
          console.warn("[SpeakPage] calculatePositions: One or more critical refs are null or agent circle not determinable.");
      }
    };

    // This will happen if showIntroScreen, currentAgentConfig, sessionStatus, or isLineRefReady changes.
    if (!showIntroScreen && sessionStatus === "CONNECTED" && isLineRefReady) { 
        console.log("[SpeakPage] All conditions met, calling calculatePositions directly.");
        calculatePositions(); 
        // Optional: A very short timeout might still be useful for layout settling if calculatePositions reads getBoundingClientRect
        // const timeoutId = setTimeout(calculatePositions, 10); // e.g., 10ms, or even 0 for next tick
        
        window.addEventListener('resize', calculatePositions);
        return () => { 
            // clearTimeout(timeoutId); 
            window.removeEventListener('resize', calculatePositions); 
        };
    } else {
        console.log("[SpeakPage] Conditions not met for calculating positions. showIntroScreen:", showIntroScreen, "sessionStatus:", sessionStatus, "isLineRefReady:", isLineRefReady);
    }
  }, [currentAgentConfig, patientAgent, preceptorAgent, showIntroScreen, sessionStatus, isLineRefReady]); // Added isLineRefReady

  // Listen to new events for user speech
  useEffect(() => {
    const handleUserSpeechStarted = () => {
      console.log("[SpeakPage] Event: USER_SPEECH_STARTED received. Setting isUserActuallySpeaking to true.");
      setIsUserActuallySpeaking(true);
    };
    const handleUserSpeechStopped = () => {
      console.log("[SpeakPage] Event: USER_SPEECH_STOPPED received. Setting isUserActuallySpeaking to false.");
      setIsUserActuallySpeaking(false);
    };
    // Potentially handle AGENT_RESPONSE_COMPLETED_EVENT here if needed for more complex turn logic

    // Assuming USER_SPEECH_STARTED_EVENT, USER_SPEECH_STOPPED_EVENT are string literals for now
    // as defined conceptually in KatoRTCContext modification.
    // These should ideally come from KatoEvents enum.
    const subUserSpeechStarted = eventBus.on(KatoEvents.USER_SPEECH_STARTED, handleUserSpeechStarted); 
    const subUserSpeechStopped = eventBus.on(KatoEvents.USER_SPEECH_STOPPED, handleUserSpeechStopped);
    // const subAgentResponseCompleted = eventBus.on(KatoEvents.AGENT_RESPONSE_COMPLETED, handleAgentResponseCompleted); // Example if used

    return () => {
      subUserSpeechStarted();
      subUserSpeechStopped();
    };
  }, [eventBus]);

  useEffect(() => { // Active speaker turn - UPDATED LOGIC
    let newTurn: 'user' | 'patient' | 'preceptor' | 'none' = 'none';

    if (isIntroAudioPlaying) {
      newTurn = currentAgentConfig?.name === patientAgent?.name ? "patient" :
                (currentAgentConfig?.name === preceptorAgent?.name ? "preceptor" : "none");
    } else if (isOutputAudioBufferActive) { // Agent speaking (primary indicator for agent)
      newTurn = currentAgentConfig?.name === patientAgent?.name ? "patient" :
                (currentAgentConfig?.name === preceptorAgent?.name ? "preceptor" : "none");
    } else if (isUserActuallySpeaking) { // User is definitively speaking
      newTurn = "user";
    } else {
      newTurn = "user"; 
    }
    console.log("[SpeakPage] Setting activeSpeakerTurn to:", newTurn, 
                "isIntro:", isIntroAudioPlaying, 
                "isAgentBufferActive:", isOutputAudioBufferActive, 
                "isUserSpeaking:", isUserActuallySpeaking);
    setActiveSpeakerTurn(newTurn);
  }, [
    isIntroAudioPlaying, 
    isOutputAudioBufferActive, 
    isUserActuallySpeaking, 
    currentAgentConfig, 
    patientAgent, 
    preceptorAgent
  ]);

  useEffect(() => { // PTT Active State based on Audio Input Mode
    const handleAudioInputModeChange = (newMode: 'conversation' | 'ptt' | 'no_mic') => {
      setIsPTTActive(newMode === 'ptt'); // Simpler: PTT is active if mode is 'ptt'
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    // Initialize based on currentAudioInputMode
    setIsPTTActive(currentAudioInputMode === 'ptt');
    return () => sub();
  }, [eventBus, currentAudioInputMode]); // currentAudioInputMode dependency for initialization

  // UI Mode is fixed to 'avatar' for this page, so no listener for UI_MODE_CHANGED needed here.

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
        let agentIdentifierForLog = "N/A";
        if (data.eventObj.type === "session.update" && data.eventObj.session?.instructions) {
          agentIdentifierForLog = data.eventObj.session.instructions.substring(0, 50) + "...";
        } else if (data.eventObj.item?.role) {
          agentIdentifierForLog = `Role: ${data.eventObj.item.role}`;
        }
        logClientEvent(data.eventObj, data.eventNameSuffix); 
        dcRef.current.send(messagePayload);
      } else {
        console.error(`[MESSAGE_SENT_TO_DC_ERROR_SPEAK] DC not open. Event: ${data.eventObj.type}`);
        addTranscriptBreadcrumb("Error: Data channel not open.");
        logClientEvent({ attemptedEvent: data.eventObj.type, error: "dc_not_open" }, `error.dc_not_open_for_${data.eventNameSuffix || 'unknown_event'}`);
      }
    };
    const unsubscribe = eventBus.on(KatoEvents.SEND_MESSAGE_TO_SERVER, handleSendMessageToServer);
    return () => unsubscribe();
  }, [eventBus, dcRef, logClientEvent, addTranscriptBreadcrumb]);

  useEffect(() => { // Initial Session Update
    if (sessionStatus === "CONNECTED" && currentAgentConfig && !hasDoneInitialAgentSetupRef.current) {
      addTranscriptBreadcrumb(`Agent ${currentAgentConfig.name} ready (Speak Page).`);
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
    if (sessionStatus === "CONNECTED" && currentAgentConfig) { // Condition to only run if connected
        handleAudioSettingsChange();
    }
  }, [isPTTActive, currentAudioInputMode, sessionStatus, eventBus, currentAgentConfig]); // isPTTActive is now local state

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

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      {/* Header */}
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

      {/* Main Content - Avatar UI Only */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {showMicDeniedModal && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Microphone Access Denied</h3>
              <p className="mb-6 text-gray-600">
                Voice interaction requires microphone access. You have been switched to text input mode.
                You can change your microphone permissions in your browser settings and reconnect if you wish to use voice.
              </p>
              <button onClick={() => setShowMicDeniedModal(false)} className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">OK</button>
            </div>
          </div>
        )}
        {showAudioInteractionModal && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
              <h3 className="text-xl font-semibold mb-4">Audio Interaction</h3>
              <p className="mb-6">This app works best with audio. Please enable your microphone and speakers.</p>
              <button onClick={() => eventBus.emit(KatoEvents.USER_CONFIRMED_AUDIO_MODAL)} className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Let\'s Get Started!</button>
            </div>
          </div>
        )}

        {/* Avatar UI */}
        <div className="flex flex-col items-center justify-center gap-8 w-full max-w-3xl relative h-full">
          <div ref={linePositioningParentRef} className="relative flex justify-around w-full items-start mt-8">
            <div className="flex flex-col items-center text-center w-1/3"> 
              <div ref={userAvatarCircleRef} className="box-content relative w-32 h-32 border-4 border-blue-500 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-3xl font-semibold shadow-lg">
                <span style={{ position: 'relative', zIndex: 1 }}>You</span>
                {((currentAudioInputMode === 'ptt' && isPTTUserSpeaking) ||
                  (currentAudioInputMode === 'conversation' && sessionStatus === 'CONNECTED' && activeSpeakerTurn === 'user')) &&
                  (<> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>)}
              </div>
            </div>
            <div className="flex flex-col items-center text-center w-1/3"> 
              {currentAgentConfig?.name === patientAgent?.name && patientAgent && (
                <div ref={patientAvatarCircleRef} className="box-content relative w-32 h-32 border-4 border-green-500 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold shadow-lg" title={`${patientAgent.publicDescription} (Active)`}>
                  <div className="flex flex-col items-center "><span className="text-3xl mt-5">Patient</span><div className="mt-1 text-xs font-medium text-gray-700">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</div></div>
                  {activeSpeakerTurn === 'patient' && (
                    <> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>
                  )}
                </div>
              )}
              {currentAgentConfig?.name === preceptorAgent?.name && preceptorAgent && (
                <div ref={preceptorAvatarCircleRef} className="box-content relative w-32 h-32 border-4 border-purple-500 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-semibold shadow-lg" title={`${preceptorAgent.publicDescription} (Active)`}>
                  <span className="text-2xl">Preceptor</span>
                  {activeSpeakerTurn === 'preceptor' && (
                    <> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>
                  )}
                </div>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-[-32px] h-8">
              <AnimatePresence mode="wait">
                {sessionStatus === "CONNECTING" && ( <motion.div key="spinner" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center justify-center h-full w-full"> <LuLoader className="animate-spin text-gray-500" size={24} /> </motion.div> )}
                {(sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") && ( <motion.div key="disconnected" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center justify-center h-full w-full"> <LuWifiOff size={24} className={sessionStatus === "ERROR" ? "text-red-500" : "text-gray-500"} /> </motion.div> )}
                {sessionStatus === "CONNECTED" && (
                  <motion.div key="line" className="relative w-full h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <motion.div ref={indicatorLineRefCallback} className="absolute h-1 w-24 top-1/2 -translate-y-1/2"
                      variants={{ user: { x: indicatorTargets.user, opacity: 1, backgroundColor: "rgb(59 130 246)" }, patient: { x: indicatorTargets.agent, opacity: 1, backgroundColor: "rgb(34 197 94)" }, preceptor: { x: indicatorTargets.agent, opacity: 1, backgroundColor: "rgb(168 85 247)" }, none: { opacity: 0 } }}
                      animate={activeSpeakerTurn} initial="none" transition={{ duration: 0.4, ease: "easeInOut" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="mt-12">
            {isPTTActive ? ( // If PTT is active (switched by user)
              <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50`}
                disabled={sessionStatus !== "CONNECTED"} > {isPTTUserSpeaking ? "Listening..." : "Push to Talk"} </button>
            ) : ( // Default VAD mode for avatar screen
              <button onClick={() => { 
                  if (sessionStatus === "CONNECTED") {
                    setCurrentAudioInputMode("ptt"); // Will trigger PTT_ACTIVE_CHANGED via event bus
                    // No direct setIsPTTActive here, let event bus handle it
                  }
                }}
                className="px-8 py-4 rounded-lg text-gray-700 font-semibold transition-colors shadow-md border border-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-300 disabled:opacity-50"
                disabled={sessionStatus !== "CONNECTED"} > Switch to Push-to-Talk </button>
            )}
          </div>
          <div className="absolute bottom-6 left-6 flex flex-col space-y-4">
            {currentAgentConfig?.name !== patientAgent?.name && patientAgent && (
              <div onClick={() => handleAvatarAgentSelect(patientAgent.name)} title={`Switch to ${patientAgent.publicDescription}`}
                className="flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all hover:bg-green-100 shadow-md hover:shadow-lg">
                <div className="w-20 h-20 border-2 border-green-400 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-xl font-semibold">Patient</div>
                <span className="mt-1 text-xs font-medium text-gray-600">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
              </div>
            )}
            {currentAgentConfig?.name !== preceptorAgent?.name && preceptorAgent && (
               <div onClick={() => handleAvatarAgentSelect(preceptorAgent.name)} title={`Switch to ${preceptorAgent.publicDescription}`}
                className="flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all hover:bg-purple-100 shadow-md hover:shadow-lg">
                <div className="w-20 h-20 border-2 border-purple-400 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 text-xl font-semibold"><span className="text-xs">Preceptor</span></div>
                <span className="mt-1 text-xs font-medium text-gray-600">&nbsp;</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4">
        <div></div> 
        <div className="flex items-center space-x-4"> 
          <button onClick={onToggleConnection}
            className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"} focus:outline-none focus:ring-2 disabled:opacity-50`}
            disabled={!currentAgentConfig && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")} >
            {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "Disconnect" : "Connect"}
          </button>
          <button onClick={() => router.push('/cases/kato/text')} // Navigate to text page
            className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2"> Write </button>
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

// Wrapper component to provide contexts NO LONGER NEEDED
export default function KatoSpeakPage() { 
  return (
    // <TranscriptProvider>
    //   <EventProvider>
    //     <EventBusProvider> 
          <KatoSpeakPageContent />
    //     </EventBusProvider>
    //   </EventProvider>
    // </TranscriptProvider>
  );
} 
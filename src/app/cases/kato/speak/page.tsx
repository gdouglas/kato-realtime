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

// Placeholder for KatoEvents - in a real scenario, add to KatoEvents.ts
// These are now in KatoEvents.ts: AGENT_SWITCH_STARTED etc.
// const AGENT_INTRO_STARTED_EVENT = "kato_event_agent_intro_started";
// const AGENT_INTRO_FINISHED_EVENT = "kato_event_agent_intro_finished";

function KatoSpeakPageContent() {
  const eventBus = useEventBus();
  const router = useRouter();
  const { addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent } = useEvent();

  const { 
    sessionStatus, 
    dcRef, 
    manualDisconnect, 
    isAudioPlaybackEnabled, 
    setIsAudioPlaybackEnabled,
  } = useKatoRTCContext();

  const { 
    selectedAgentName, 
    currentAgentConfig, 
    patientAgent,
    preceptorAgent,
    selectAgent, // Function to request agent change
    isSwitchingInProgress, // New state from context
  } = useAgentContext();

  const urlCodec = "opus";

  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(true);
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);

  const audioElementRef = useRef<HTMLAudioElement | null>(null); 
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
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

  // useIntroAudio hook is now simpler, only provides isIntroAudioPlaying and listens for PLAY_AGENT_INTRO_REQUESTED
  const { isIntroAudioPlaying } = useIntroAudio({ addTranscriptBreadcrumb });

  const introButtonClickedRef = useRef(false); // Still useful for initial screen choice

  const indicatorLineRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      indicatorLineRef.current = node;
      setIsLineRefReady(true);
    } else {
      setIsLineRefReady(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgentName) {
      setShowIntroScreen(false);
    } else {
      setShowIntroScreen(true);
      introButtonClickedRef.current = false;
    }
  }, [selectedAgentName]);

  // Effect for when current agent changes (e.g. after successful switch)
  useEffect(() => {
    const handleAgentChangedPageLogic = (data?: { agentName?: string }) => { 
      console.log(`[SpeakPage] CURRENT_AGENT_CHANGED event received. New agent: ${data?.agentName}. Resetting hasDoneInitialAgentSetupRef.`);
      hasDoneInitialAgentSetupRef.current = false; // Reset for the new agent
    };
    const subChange = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChangedPageLogic);
    return () => subChange();
  }, [eventBus]); 

  // Effects for connection status breadcrumbs (mostly unchanged, but review dependencies)
  useEffect(() => {
    const handleConnectionEstablished = () => addTranscriptBreadcrumb("Data channel open.");
    const handleConnectionFailed = (error: Error) => {
      addTranscriptBreadcrumb(`Error connecting: ${error.message}`);
      // Session status is now managed by KatoRTCContext based on its own events and useKatoRTC hook
    };
    const handleDataChannelStatus = (status: 'open' | 'closed' | 'error') => {
        if (status === 'closed') addTranscriptBreadcrumb("Data channel closed.");
        if (status === 'error') addTranscriptBreadcrumb("Data channel error.");
        // Let KatoRTCContext handle session status changes based on DC status
    };
    const subEst = eventBus.on(KatoEvents.CONNECTION_ESTABLISHED, handleConnectionEstablished);
    const subFail = eventBus.on(KatoEvents.CONNECTION_FAILED, handleConnectionFailed);
    const subDc = eventBus.on(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, handleDataChannelStatus);
    return () => { subEst(); subFail(); subDc(); };
  }, [eventBus, addTranscriptBreadcrumb]); 

  // Effect to perform session.update when requested
  useEffect(() => {
    const performUpdateSession = (data?: { 
      shouldTriggerResponse?: boolean; 
      isIntroSequence?: boolean; 
    }) => {
        if (!currentAgentConfig) return;
        
        // Clear input audio buffer (still relevant)
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
            eventObj: { type: "input_audio_buffer.clear" },
            eventNameSuffix: "clear audio buffer on session update (speak page)"
        });

        let turnDetectionConfig: any = null;
        let modalitiesConfig = ["text", "audio"];
        let transcriptionConfig: any = { model: "whisper-1", language: "en" };

        if (currentAudioInputMode === "no_mic") {
          modalitiesConfig = ["text"];
          transcriptionConfig = null;
        } else if (data?.isIntroSequence && sessionStatus === "CONNECTED") {
          console.log(`[SpeakPage] SESSION_UPDATE_LOGIC: data.isIntroSequence is true for ${currentAgentConfig.name}. Setting turnDetectionConfig to null.`);
          turnDetectionConfig = null;
        } else if (currentAudioInputMode === "conversation") {
          turnDetectionConfig = {
            type: "server_vad", threshold: 0.5, prefix_padding_ms: 300,
            silence_duration_ms: 200, create_response: true,
          };
        }

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
        
        if (data?.shouldTriggerResponse && !data?.isIntroSequence) {
            const id = uuidv4().slice(0, 32);
            console.log(`[SpeakPage] SESSION_UPDATE_LOGIC: Sending simulated 'Hi' for agent: ${currentAgentConfig?.name}.`);
            addTranscriptMessage(id, "user", "Hi", true);
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
                eventObj: { type: "conversation.item.create", item: { id, type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] } },
                eventNameSuffix: "(simulated hi - speak page)"
            });
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response after hi - speak page)" });
        }
    };
    const sub = eventBus.on(KatoEvents.SESSION_UPDATE_REQUESTED, performUpdateSession);
    return () => sub();
  }, [eventBus, currentAgentConfig, currentAudioInputMode, addTranscriptMessage, sessionStatus]);

  const cancelAssistantSpeechLogic = useCallback(() => {
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.cancel" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    if (isOutputAudioBufferActive) { 
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "output_audio_buffer.clear" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    }
  }, [eventBus, isOutputAudioBufferActive]);

  useEffect(() => { // For receiving server messages to transcript
    const handleServerTranscript = (data: { idToAssign: string, role: 'user' | 'assistant', title: string, isLocal?: boolean}) => {
        addTranscriptMessage(data.idToAssign, data.role, data.title, data.isLocal);
    };
    const sub = eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM, handleServerTranscript);
    return () => sub();
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    const handleOutputBufferStatusChanged = (isActive: boolean) => setIsOutputAudioBufferActive(isActive);
    const sub = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleOutputBufferStatusChanged);
    return () => sub();
  }, [eventBus]);

  useEffect(() => { // Audio Interaction Modal
    const handleVisibilityChange = (isVisible: boolean) => setShowAudioInteractionModal(isVisible);
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
      // No longer emitting USER_CONFIRMED_AUDIO_MODAL here to trigger connection, 
      // as useIntroAudio/useAgentManager handles the flow after modal confirmation if it was related to intro playback.
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

  // Simplified onToggleConnection - relies on KatoRTCContext for connect/disconnect events
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

  // Simplified agent selection - just calls selectAgent from context
  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    console.log(`[SpeakPage] User clicked to switch to agent: ${newAgentName}`);
    selectAgent(newAgentName); // selectAgent is from useAgentContext, it emits USER_SELECTED_AGENT
  }, [selectAgent]);

  useEffect(() => {
    const subInterrupt = eventBus.on(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH, cancelAssistantSpeechLogic);
    return () => subInterrupt();
  }, [eventBus, cancelAssistantSpeechLogic]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open") return;
    eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH);
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_START);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.clear" }, eventNameSuffix: "clear PTT buffer (speak)" });
  }, [sessionStatus, eventBus, dcRef]);

  const handleTalkButtonUp = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open" || !isPTTUserSpeaking) return;
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_END);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.commit" }, eventNameSuffix: "commit PTT (speak)" });
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "trigger response PTT (speak)" });
  }, [sessionStatus, isPTTUserSpeaking, eventBus, dcRef]);
  
  const handleCreateDDx = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      addTranscriptBreadcrumb("Disconnecting session before navigating to DDx page...");
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, {isSwitchingAgent: false}); 
    }
    router.push('/cases/kato/ddx');
  }, [router, sessionStatus, eventBus, addTranscriptBreadcrumb]);

  // Effect for indicator line positioning (unchanged)
  useEffect(() => { 
    const calculatePositions = () => {
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
            console.warn("[SpeakPage] calculatePositions: Zero dimension detected.");
            return; 
        }
        const userCircleCenterX = (userCircleRect.left - parentRect.left) + (userCircleRect.width / 2);
        const userIndicatorX = userCircleCenterX - (actualIndicatorWidth / 2);
        const agentCircleCenterX = (agentCircleRect.left - parentRect.left) + (agentCircleRect.width / 2);
        const agentIndicatorX = agentCircleCenterX - (actualIndicatorWidth / 2);
        
        setIndicatorTargets({ user: userIndicatorX, agent: agentIndicatorX });
      } else {
          console.warn("[SpeakPage] calculatePositions: One or more critical refs are null or agent circle not determinable.");
      }
    };

    if (!showIntroScreen && sessionStatus === "CONNECTED" && isLineRefReady) { 
        calculatePositions(); 
        window.addEventListener('resize', calculatePositions);
        return () => { 
            window.removeEventListener('resize', calculatePositions); 
        };
    }
  }, [currentAgentConfig, patientAgent, preceptorAgent, showIntroScreen, sessionStatus, isLineRefReady]);

  // User speech events (unchanged)
  useEffect(() => {
    const handleUserSpeechStarted = () => setIsUserActuallySpeaking(true);
    const handleUserSpeechStopped = () => setIsUserActuallySpeaking(false);
    const subUserSpeechStarted = eventBus.on(KatoEvents.USER_SPEECH_STARTED, handleUserSpeechStarted); 
    const subUserSpeechStopped = eventBus.on(KatoEvents.USER_SPEECH_STOPPED, handleUserSpeechStopped);
    return () => {
      subUserSpeechStarted();
      subUserSpeechStopped();
    };
  }, [eventBus]);

  // Active speaker turn logic (mostly unchanged, relies on isIntroAudioPlaying from useIntroAudio)
  useEffect(() => {
    let newTurn: 'user' | 'patient' | 'preceptor' | 'none' = 'none';
    if (isIntroAudioPlaying) {
      newTurn = currentAgentConfig?.name === patientAgent?.name ? "patient" :
                (currentAgentConfig?.name === preceptorAgent?.name ? "preceptor" : "none");
    } else if (isOutputAudioBufferActive) {
      newTurn = currentAgentConfig?.name === patientAgent?.name ? "patient" :
                (currentAgentConfig?.name === preceptorAgent?.name ? "preceptor" : "none");
    } else if (isUserActuallySpeaking) {
      newTurn = "user";
    } else {
      newTurn = "user"; 
    }
    setActiveSpeakerTurn(newTurn);
  }, [
    isIntroAudioPlaying, 
    isOutputAudioBufferActive, 
    isUserActuallySpeaking, 
    currentAgentConfig, 
    patientAgent, 
    preceptorAgent
  ]);

  // PTT Active State (unchanged)
  useEffect(() => {
    const handleAudioInputModeChange = (newMode: 'conversation' | 'ptt' | 'no_mic') => {
      setIsPTTActive(newMode === 'ptt');
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    setIsPTTActive(currentAudioInputMode === 'ptt');
    return () => sub();
  }, [eventBus, currentAudioInputMode]);

  // Audio Input Mode (unchanged)
  useEffect(() => {
    const handleAudioInputModeChange = (newMode: "conversation" | "ptt" | "no_mic") => setCurrentAudioInputMode(newMode);
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    return () => sub();
  }, [eventBus]);

  // Audio Playback Enabled (unchanged)
  useEffect(() => {
    const handleAudioPlaybackEnabledChange = (isEnabled: boolean) => {
      setIsAudioPlaybackEnabled(isEnabled);
      if (audioElementRef.current) audioElementRef.current.autoplay = isEnabled;
    };
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handleAudioPlaybackEnabledChange);
    return () => sub();
  }, [eventBus, setIsAudioPlaybackEnabled]); // Added setIsAudioPlaybackEnabled from context

  // SEND_MESSAGE_TO_SERVER Handler (unchanged)
  useEffect(() => {
    const handleSendMessageToServer = (data: { eventObj: any, eventNameSuffix?: string }) => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        const messagePayload = JSON.stringify(data.eventObj);
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

  // Revised Initial Session Update / Session Update on setting changes
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && currentAgentConfig && !hasDoneInitialAgentSetupRef.current) {
      addTranscriptBreadcrumb(`Agent ${currentAgentConfig.name} ready (Speak Page).`);
      
      // Determine if this connection is part of an intro sequence.
      // isIntroAudioPlaying from useIntroAudio is the primary indicator now.
      const isCurrentlyAnIntroSequence = isIntroAudioPlaying;
      
      // Trigger a response ("Hi") only if NOT an intro and NOT the very first connection for this agent setup cycle.
      // hasDoneInitialAgentSetupRef helps track if we've done this for the current agent activation.
      const shouldTriggerAutomaticResponse = !isCurrentlyAnIntroSequence;

      console.log(`[SpeakPage] Initial Setup/Session Update: Agent: ${currentAgentConfig.name}, isIntroPlaying: ${isCurrentlyAnIntroSequence} => shouldTriggerHi: ${shouldTriggerAutomaticResponse}`);

      eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { 
        shouldTriggerResponse: shouldTriggerAutomaticResponse, 
        isIntroSequence: isCurrentlyAnIntroSequence, 
      });
      
      hasDoneInitialAgentSetupRef.current = true;
    }
  }, [sessionStatus, currentAgentConfig, eventBus, addTranscriptBreadcrumb, isIntroAudioPlaying]);

  // Effect for Audio Settings Change (PTT/VAD)
  useEffect(() => { 
    if(sessionStatus === "CONNECTED" && currentAgentConfig && hasDoneInitialAgentSetupRef.current) {
        // Only send a session update if we are already connected and initial setup was done.
        // Avoids sending session.update before the very first one after connection.
        console.log("[SpeakPage] Audio settings changed (PTT/VAD), requesting session update.");
        eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { 
            shouldTriggerResponse: false, // Usually don't need a "Hi" for just a mode toggle
            isIntroSequence: isIntroAudioPlaying // Reflect current intro state
        });
    }
  }, [isPTTActive, currentAudioInputMode, sessionStatus, eventBus, currentAgentConfig, isIntroAudioPlaying]);

  // Mic Denied Modal (unchanged)
  useEffect(() => {
    const showModal = () => setShowMicDeniedModal(true);
    const sub = eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, showModal);
    return () => sub();
  }, [eventBus]);

  // Removed AGENT_INTRO_STARTED and AGENT_INTRO_FINISHED effects as this specific page doesn't need to manage playedAgentIntros directly.
  // isIntroAudioPlaying from useIntroAudio is the source of truth for UI reactions.

  // Removed POST_DISCONNECT_CONNECT_LOGIC effect - handled by useAgentManager
  // Removed NO_INTRO_CONNECT_TRIGGER effect - handled by useAgentManager & useIntroAudio

  const isDisconnectedOrErrorState = sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR";

  const handleStartWithPatient = () => {
    introButtonClickedRef.current = true;
    console.log(`[SpeakPage] User selected Start With Patient.`);
    selectAgent("mrKato");
    // setShowIntroScreen(false); // This is handled by useEffect on selectedAgentName
  };

  const handleStartWithPreceptor = () => {
    introButtonClickedRef.current = true;
    console.log(`[SpeakPage] User selected Start With Preceptor.`);
    selectAgent("preceptor");
    // setShowIntroScreen(false); // This is handled by useEffect on selectedAgentName
  };

  if (showIntroScreen) {
    return <KatoIntroScreen onStartWithPatient={handleStartWithPatient} onStartWithPreceptor={handleStartWithPreceptor} />;
  }

  // Determine if agent switchers should be disabled
  const disableAgentSwitchers = isIntroAudioPlaying || isSwitchingInProgress;

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
              {isSwitchingInProgress && <span className="ml-2 text-blue-600">(Switching agent...)</span>}
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
                    <> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>) 
                  }
                </div>
              )}
              {currentAgentConfig?.name === preceptorAgent?.name && preceptorAgent && (
                <div ref={preceptorAvatarCircleRef} className="box-content relative w-32 h-32 border-4 border-purple-500 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-semibold shadow-lg" title={`${preceptorAgent.publicDescription} (Active)`}>
                  <span className="text-2xl">Preceptor</span>
                  {activeSpeakerTurn === 'preceptor' && (
                    <> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>) 
                  }
                </div>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-[-32px] h-8">
              <AnimatePresence mode="wait">
                {(sessionStatus === "CONNECTING" || isSwitchingInProgress) && ( <motion.div key="spinner" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center justify-center h-full w-full"> <LuLoader className="animate-spin text-gray-500" size={24} /> </motion.div> )}
                {(sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") && !isSwitchingInProgress && ( <motion.div key="disconnected" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center justify-center h-full w-full"> <LuWifiOff size={24} className={sessionStatus === "ERROR" ? "text-red-500" : "text-gray-500"} /> </motion.div> )}
                {sessionStatus === "CONNECTED" && !isSwitchingInProgress && (
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
            {/* PTT Button or Switch to PTT Button - UI logic based on isPTTActive, sessionStatus */}
            {isPTTActive ? (
              <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50`}
                disabled={sessionStatus !== "CONNECTED" || isSwitchingInProgress || isIntroAudioPlaying} > {isPTTUserSpeaking ? "Listening..." : "Push to Talk"} </button>
            ) : (
              <button onClick={() => { 
                  if (sessionStatus === "CONNECTED" && !isSwitchingInProgress && !isIntroAudioPlaying) {
                    setCurrentAudioInputMode("ptt");
                  }
                }}
                className="px-8 py-4 rounded-lg text-gray-700 font-semibold transition-colors shadow-md border border-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-300 disabled:opacity-50"
                disabled={sessionStatus !== "CONNECTED" || isSwitchingInProgress || isIntroAudioPlaying} > Switch to Push-to-Talk </button>
            )}
          </div>
          <div className="absolute bottom-6 left-6 flex flex-col space-y-4">
            {/* Agent Switcher for Patient */}
            {currentAgentConfig?.name !== patientAgent?.name && patientAgent && (
              <div 
                onClick={() => !disableAgentSwitchers && handleAvatarAgentSelect(patientAgent.name)}
                title={disableAgentSwitchers ? (isIntroAudioPlaying ? "Agent intro playing..." : "Agent switch in progress...") : `Switch to ${patientAgent.publicDescription}`}
                className={`flex flex-col items-center text-center p-3 rounded-xl transition-all shadow-md hover:shadow-lg ${disableAgentSwitchers ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:bg-green-100'}`}
              >
                <div className="w-20 h-20 border-2 border-green-400 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-xl font-semibold">Patient</div>
                <span className="mt-1 text-xs font-medium text-gray-600">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
              </div>
            )}
            {/* Agent Switcher for Preceptor */}
            {currentAgentConfig?.name !== preceptorAgent?.name && preceptorAgent && (
               <div 
                onClick={() => !disableAgentSwitchers && handleAvatarAgentSelect(preceptorAgent.name)}
                title={disableAgentSwitchers ? (isIntroAudioPlaying ? "Agent intro playing..." : "Agent switch in progress...") : `Switch to ${preceptorAgent.publicDescription}`}
                className={`flex flex-col items-center text-center p-3 rounded-xl transition-all shadow-md hover:shadow-lg ${disableAgentSwitchers ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:bg-purple-100'}`}
               >
                <div className="w-20 h-20 border-2 border-purple-400 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 text-xl font-semibold"><span className="text-xs">Preceptor</span></div>
                <span className="mt-1 text-xs font-medium text-gray-600">&nbsp;</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Toolbar - UI logic based on sessionStatus, currentAgentConfig, isSwitchingInProgress */}
      <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4">
        <div></div> 
        <div className="flex items-center space-x-4"> 
          <button onClick={onToggleConnection}
            className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"} focus:outline-none focus:ring-2 disabled:opacity-50`}
            disabled={(!currentAgentConfig && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")) || isSwitchingInProgress} >
            {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "Disconnect" : "Connect"}
          </button>
          <button onClick={() => router.push('/cases/kato/text')} 
            className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 disabled:opacity-50"
            disabled={isSwitchingInProgress || isIntroAudioPlaying}>
             Write 
          </button>
        </div>
        <div> 
          <button onClick={handleCreateDDx}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 disabled:opacity-50"
            disabled={isSwitchingInProgress || isIntroAudioPlaying}>
            Create a DDx
          </button>
        </div>
      </div>
      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
    </div>
  );
}

export default function KatoSpeakPage() { 
  return (
    <KatoSpeakPageContent />
  );
}

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { LuWifiOff, LuLoader, LuInfo } from "react-icons/lu";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Contexts and Hooks
import { useAgentContext } from '@/app/contexts/AgentContext';
import { TranscriptProvider, useTranscript } from "@/app/contexts/TranscriptContext";
import { EventProvider, useEvent } from "@/app/contexts/EventContext";
import { useEventBus, EventBusProvider } from "@/app/contexts/EventBusContext";
import { useIntroAudio } from '@/app/hooks/useIntroAudio';
import { useAgentLifecycle } from '@/app/contexts/AgentLifecycleContext';
import useAudioDownload from "@/app/hooks/useAudioDownload";

// Libs and Types
import { EventBus } from '@/app/lib/eventBus';
import { AgentConfig, SessionStatus } from '@/app/types';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { setAudioOutputEnabled } from '@/app/lib/realtimeConnection';

// UI components
import KatoIntroScreen from "@/app/components/KatoIntroScreen";
import CaseInfoModal from "@/app/components/CaseInfoModal";
import AgentSwitcher from "@/app/components/AgentSwitcher/AgentSwitcher";
import BottomBar from "@/app/components/BottomBar/BottomBar";
import TokenCountDisplay from '@/app/components/TokenCountDisplay';

// Utilities & Case Data
import { katoCaseDetails } from "@/app/cases/kato/katoCaseData";

// Specific Agent config
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

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

  const agentLifecycle = useAgentLifecycle();
  const { 
    sessionStatus,
    dc: contextDc,
    currentAgentConfig,
    isAudioPlaybackEnabled,
    error: lifecycleError,
    logServerEvent: contextLogServerEvent,
    addTranscriptBreadcrumb: contextAddTranscriptBreadcrumb,
    eventBus: contextEventBus,
    urlCodec: contextUrlCodec,
    micEnabled, 
    audioOutputEnabled,
    pushToTalk, 
  } = agentLifecycle.state.context;

  const { 
    selectedAgentName, 
    patientAgent,
    preceptorAgent,
    selectAgent,
    isSwitchingInProgress,
  } = useAgentContext();

  const urlCodec = "opus";

  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(true);
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<"conversation" | "ptt" | "no_mic">(
    (pushToTalk === undefined || pushToTalk === null) ? "conversation" : (pushToTalk ? "ptt" : "conversation")
  );
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

  const { isIntroAudioPlaying } = useIntroAudio({ addTranscriptBreadcrumb });

  const introButtonClickedRef = useRef(false);

  const indicatorLineRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      indicatorLineRef.current = node;
      setIsLineRefReady(true);
    } else {
      setIsLineRefReady(false);
    }
  }, []);

  const dcRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    if (contextDc) {
      console.log('[SpeakPage] Data channel from context assigned to reference');
      dcRef.current = contextDc;
    } else {
      dcRef.current = null;
    }
  }, [contextDc]);

  useEffect(() => {
    const handleSendMessageToServer = (data: { eventObj: any, eventNameSuffix?: string }) => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        const messagePayload = JSON.stringify(data.eventObj);
        logClientEvent(data.eventObj, data.eventNameSuffix); 
        dcRef.current.send(messagePayload);
      } else {
        console.error(`[SpeakPage] Error: Data channel not open. Event: ${data.eventObj?.type}`);
        addTranscriptBreadcrumb("Error: Data channel not open.");
        logClientEvent({ attemptedEvent: data.eventObj?.type, error: "dc_not_open" }, `error.dc_not_open_for_${data.eventNameSuffix || 'unknown_event'}`);
      }
    };
    const unsubscribe = eventBus.on(KatoEvents.SEND_MESSAGE_TO_SERVER, handleSendMessageToServer);
    return () => unsubscribe();
  }, [eventBus, dcRef, logClientEvent, addTranscriptBreadcrumb]);

  useEffect(() => {
    if (selectedAgentName) {
      setShowIntroScreen(false);
    } else {
      setShowIntroScreen(true);
      introButtonClickedRef.current = false;
    }
  }, [selectedAgentName]);

  useEffect(() => {
    const handleAgentChangedPageLogic = (data?: { newAgentName?: string; agentConfig?: AgentConfig }) => { 
      console.log(`[SpeakPage] Agent changed via EventBus to: ${data?.newAgentName}`);
      hasDoneInitialAgentSetupRef.current = false;
    };
    const subChange = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChangedPageLogic);
    return () => subChange();
  }, [eventBus]);

  useEffect(() => {
    const handleConnectionEstablished = () => addTranscriptBreadcrumb("Data channel open.");
    const handleConnectionFailed = (error: Error) => {
      addTranscriptBreadcrumb(`Error connecting: ${error.message}`);
    };
    const handleDataChannelStatus = (status: 'open' | 'closed' | 'error') => {
        if (status === 'closed') addTranscriptBreadcrumb("Data channel closed.");
        if (status === 'error') addTranscriptBreadcrumb("Data channel error.");
    };
    const subEst = eventBus.on(KatoEvents.CONNECTION_ESTABLISHED, handleConnectionEstablished);
    const subFail = eventBus.on(KatoEvents.CONNECTION_FAILED, handleConnectionFailed);
    const subDc = eventBus.on(KatoEvents.DATA_CHANNEL_STATUS_CHANGED, handleDataChannelStatus);
    return () => { subEst(); subFail(); subDc(); };
  }, [eventBus, addTranscriptBreadcrumb]); 

  const cancelAssistantSpeechLogic = useCallback(() => {
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.cancel" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    if (isOutputAudioBufferActive) { 
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "output_audio_buffer.clear" }, eventNameSuffix: "(cancel due to user interruption - speak page)"});
    }
  }, [eventBus, isOutputAudioBufferActive]);

  useEffect(() => {
    const handleServerTranscript = (data: { idToAssign: string, role: 'user' | 'assistant', title: string, isLocal?: boolean}) => {
        addTranscriptMessage(data.idToAssign, data.role, data.title, data.isLocal);
    };
    const sub = eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM, handleServerTranscript);
    return () => sub();
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    const handleOutputBufferStatusChanged = (isActive: boolean) => {
      setIsOutputAudioBufferActive(isActive);
      if (isActive) {
        console.log('[SpeakPage] Event: OUTPUT_AUDIO_BUFFER_STATUS_CHANGED - Active. isAudioPlaybackEnabled:', isAudioPlaybackEnabled);
        if (audioElementRef.current) {
          console.log('[SpeakPage] audioElementRef.current state: paused:', audioElementRef.current.paused, ', muted:', audioElementRef.current.muted, ', volume:', audioElementRef.current.volume, ', srcObject:', audioElementRef.current.srcObject);
          if (isAudioPlaybackEnabled && audioElementRef.current.paused && audioElementRef.current.srcObject) {
            console.log('[SpeakPage] Attempting to play audioElement due to output buffer active and playback enabled.');
            audioElementRef.current.play().catch(e => console.error('[SpeakPage] Error trying to play audio on output buffer active:', e));
          }
        }
      } else {
        console.log('[SpeakPage] Event: OUTPUT_AUDIO_BUFFER_STATUS_CHANGED - Inactive.');
        if (audioElementRef.current && !audioElementRef.current.paused) {
          console.log('[SpeakPage] Paused audio due to output buffer inactive.');
          audioElementRef.current.pause();
        }
      }
    };
    const sub = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleOutputBufferStatusChanged);
    return () => sub();
  }, [eventBus, isAudioPlaybackEnabled]);

  useEffect(() => {
    const handleVisibilityChange = (isVisible: boolean) => setShowAudioInteractionModal(isVisible);
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
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
    console.log(`[SpeakPage] onToggleConnection called. SessionStatus: ${sessionStatus}, XState status: ${agentLifecycle.state.value}, Current Agent: ${currentAgentConfig?.name}`);
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" || agentLifecycle.state.matches('agentActive')) {
      console.log("[SpeakPage] Sending USER_REQUESTED_DISCONNECT to XState machine.");
      agentLifecycle.send({ type: 'USER_REQUESTED_DISCONNECT' });
    } else {
      if (agentLifecycle.state.matches('idle')) {
        if (currentAgentConfig && currentAgentConfig.name) {
          console.log(`[SpeakPage] Machine is idle and agent ${currentAgentConfig.name} is selected. Sending SELECT_AGENT.`);
          agentLifecycle.send({ type: 'SELECT_AGENT', agentName: currentAgentConfig.name });
        } else {
          console.warn("[SpeakPage] Machine is idle but no current agent config to select. Doing nothing.");
        }
      } else if (agentLifecycle.state.matches('connectionError') || 
                 agentLifecycle.state.matches('errorIntroFailed') || 
                 agentLifecycle.state.matches('switchError')) {
        console.log(`[SpeakPage] Machine is in error state (${agentLifecycle.state.value}). Sending RETRY.`);
        agentLifecycle.send({ type: 'RETRY' });
      } else {
        console.warn(`[SpeakPage] onToggleConnection: In unhandled state for connection attempt. Status: ${sessionStatus}, XState: ${agentLifecycle.state.value}. Sending RETRY as fallback.`);
        agentLifecycle.send({ type: 'RETRY' }); 
      }
    }
  }, [sessionStatus, agentLifecycle, currentAgentConfig]);

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    console.log(`[SpeakPage] User clicked to switch to agent: ${newAgentName}`);
    selectAgent(newAgentName);
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
      agentLifecycle.send({ type: 'USER_REQUESTED_DISCONNECT' });
    }
    router.push('/cases/kato/ddx');
  }, [router, sessionStatus, agentLifecycle, addTranscriptBreadcrumb]);

  const handleNavigateToWrite = useCallback(() => {
    console.log("[SpeakPage] Navigating to write page");
    eventBus.emit(KatoEvents.NAVIGATE_TO_WRITE_CLICKED);
    router.push('/cases/kato/write');
  }, [router, eventBus]);

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
      if (sessionStatus === "CONNECTED") {
        newTurn = "user";
      } else {
        newTurn = "none";
      }
    }
    
    if (activeSpeakerTurn !== newTurn) {
        console.log(`[ActiveSpeakerTurnDEBUG] Setting activeSpeakerTurn from '${activeSpeakerTurn}' to: '${newTurn}' (Inputs: introPlaying=${isIntroAudioPlaying}, outputActive=${isOutputAudioBufferActive}, userSpeaking=${isUserActuallySpeaking}, session=${sessionStatus}, currentAgent=${currentAgentConfig?.name})`);
    }
    setActiveSpeakerTurn(newTurn);
  }, [
    isIntroAudioPlaying, 
    isOutputAudioBufferActive, 
    isUserActuallySpeaking, 
    currentAgentConfig, 
    patientAgent, 
    preceptorAgent,
    sessionStatus,
  ]);

  useEffect(() => {
    const handleAudioInputModeChange = (newMode: 'conversation' | 'ptt' | 'no_mic') => {
      console.log('[SpeakPage] AUDIO_INPUT_MODE_CHANGED received:', newMode);
      setCurrentAudioInputMode(newMode);
      setIsPTTActive(newMode === 'ptt');
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    // Set initial state from context
    handleAudioInputModeChange(currentAudioInputMode);
    return () => sub();
  }, [eventBus]);

  useEffect(() => {
    const handleAudioPlaybackEnabledChange = (isEnabled: boolean) => {
      console.log(`[SpeakPage] Audio playback toggled: ${isEnabled}`);
      eventBus.emit(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, isEnabled);
    };
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handleAudioPlaybackEnabledChange);
    return () => sub();
  }, [eventBus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && currentAgentConfig && !hasDoneInitialAgentSetupRef.current) {
      addTranscriptBreadcrumb(`Agent ${currentAgentConfig.name} ready (Speak Page).`);
      
      const currentAgentName = currentAgentConfig.name;
      const machineContext = agentLifecycle.state.context;
      const playedIntros = machineContext.playedAgentIntros;
      const prevAgent = machineContext.previousAgentName; 

      let triggerHi = false;
      if (!isIntroAudioPlaying) { 
        if (prevAgent === undefined) {
          triggerHi = false;
        } else {
          if (playedIntros.has(currentAgentName)) {
            triggerHi = true;
          }
        }
      }

      const isIntroSequenceForSessionUpdate = isIntroAudioPlaying || (prevAgent === undefined && playedIntros.has(currentAgentName));

      console.log(`[SpeakPage] Initial Setup Logic: Agent: ${currentAgentName}, isIntroAudioPlaying: ${isIntroAudioPlaying}, prevAgent: ${prevAgent}, playedIntros: ${Array.from(playedIntros).join(', ')}, => triggerHi: ${triggerHi}, isIntroSequenceForSessionUpdate: ${isIntroSequenceForSessionUpdate}`);

      // REMOVED: eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { 
      //   shouldTriggerResponse: triggerHi, 
      //   isIntroSequence: isIntroSequenceForSessionUpdate,
      // });
      // The XState machine now handles the initial session.update with appropriate VAD settings.
      // If proactive 'Hi' is still desired, it needs to be sent differently, 
      // ensuring it doesn't interfere with VAD setup or cause an extra agent response.
      // For now, focusing on one response per user utterance means not sending a session.update here
      // that could result in a null turn_detection.
      
      hasDoneInitialAgentSetupRef.current = true;
    }
  }, [sessionStatus, currentAgentConfig, eventBus, addTranscriptBreadcrumb, isIntroAudioPlaying, agentLifecycle.state.context]);

  useEffect(() => {
    const showModal = () => setShowMicDeniedModal(true);
    const sub = eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, showModal);
    return () => sub();
  }, [eventBus]);

  const isDisconnectedOrErrorState = sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR";
  const isIdle = agentLifecycle.state.matches('idle');

  const handleStartWithPatient = () => {
    introButtonClickedRef.current = true;
    console.log(`[SpeakPage] User selected Start With Patient.`);
    selectAgent("mrKato");
  };

  const handleStartWithPreceptor = () => {
    introButtonClickedRef.current = true;
    console.log(`[SpeakPage] User selected Start With Preceptor.`);
    selectAgent("preceptor");
  };

  const createServerEventHandler = useCallback(( 
    eventBus: EventBus, 
    audioElement: HTMLAudioElement | null, 
    urlCodec: string, 
    agentConfig: AgentConfig | null | undefined, 
    addTranscriptBreadcrumb: (message: string) => void,
    logServerEvent: (eventObj: any, eventNameSuffix?: string) => void, 
    isSwitching: boolean
  ) => {
    return (serverMessage: any) => {
      console.log('[SpeakPage] createServerEventHandler received message:', serverMessage, { agentName: agentConfig?.name, isSwitching });
      logServerEvent(serverMessage, `handler_received_${serverMessage?.type || 'unknown'}`);
    };
  }, []);

  useEffect(() => {
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio();
      audioElementRef.current.autoplay = true;
      audioElementRef.current.controls = true; // For debugging, remove in production
      console.log('[SpeakPage] Audio element initialized');
      
      if (agentLifecycle && agentLifecycle.send) {
        console.log('[SpeakPage] Sending audio element to state machine');
        agentLifecycle.send({ type: 'AUDIO_ELEMENT_READY', audioElement: audioElementRef.current });
      }
    }

    return () => {
      if (audioElementRef.current) {
        console.log('[SpeakPage] Cleaning up audio element on unmount');
        audioElementRef.current.pause();
        audioElementRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    // Mute/unmute audio element when isAudioPlaybackEnabled changes
    if (audioElementRef.current) {
      setAudioOutputEnabled(audioElementRef.current, isAudioPlaybackEnabled);
    }
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (pushToTalk) {
      eventBus.emit(KatoEvents.USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE, { mode: 'ptt' });
    } else {
      eventBus.emit(KatoEvents.USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE, { mode: 'conversation' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToTalk]);

  // Bridge: Forward USER_UPDATED_SETTINGS from event bus to XState machine
  useEffect(() => {
    const unsub = eventBus.on(KatoEvents.USER_UPDATED_SETTINGS, (settings) => {
      console.log('[SpeakPage] Forwarding USER_UPDATED_SETTINGS to XState:', settings);
      agentLifecycle.send({ type: 'USER_UPDATED_SETTINGS', ...settings });
    });
    return () => unsub();
  }, [eventBus, agentLifecycle]);

  // Synchronize currentAudioInputMode with pushToTalk from XState context
  useEffect(() => {
    setCurrentAudioInputMode(pushToTalk ? "ptt" : "conversation");
  }, [pushToTalk]);

  if (showIntroScreen) {
    return <KatoIntroScreen onStartWithPatient={handleStartWithPatient} onStartWithPreceptor={handleStartWithPreceptor} />;
  }

  const disableAgentSwitchers = isIntroAudioPlaying || isSwitchingInProgress;

  const ConnectionStatusIndicator: React.FC = () => {
    return (
      <div className="flex items-center text-sm font-medium">
        Status:
        {isSwitchingInProgress && <span className="ml-2 text-blue-600">Switching agent...</span>}
        {!isSwitchingInProgress && (
          <>
            {sessionStatus === "CONNECTED" && <span className="ml-2 text-green-600">(Connected)</span>}
            {sessionStatus === "CONNECTING" && <span className="ml-2 text-yellow-600">(Connecting...)</span>}
            {isDisconnectedOrErrorState && isIdle && selectedAgentName && <span className="ml-2 text-gray-500">(Disconnected)</span>}
            {sessionStatus === "ERROR" && <span className="ml-2 text-red-600">(Error)</span>}            
          </>
        )}
      </div>
    );
  };

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-4 text-lg font-semibold flex justify-between items-center border-b bg-white shadow-sm">
        <div className="flex items-center">
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
              <ConnectionStatusIndicator />
              {lifecycleError && (
                <div className="mt-1 text-xs text-red-700 bg-red-100 p-2 rounded shadow">
                  <strong>Machine Error:</strong> {typeof lifecycleError === 'string' ? lifecycleError : JSON.stringify(lifecycleError)}
                </div>
              )}
            </>
          ) : "No agent selected"}
        </div>
      </div>

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

        <div className="flex flex-col items-center justify-center gap-8 w-full max-w-3xl relative h-full">
          <div ref={linePositioningParentRef} className="relative flex justify-around w-full items-start mt-8">
            <div className="flex flex-col items-center text-center w-1/3"> 
              <div ref={userAvatarCircleRef} className="box-content relative w-32 h-32 border-4 border-blue-500 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-3xl font-semibold shadow-lg">
                <span style={{ position: 'relative', zIndex: 1 }}>You</span>
                {((currentAudioInputMode === 'ptt' && isPTTUserSpeaking) ||
                  (currentAudioInputMode === 'conversation' && sessionStatus === 'CONNECTED' && activeSpeakerTurn === 'user' && !isOutputAudioBufferActive)) &&
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
            {currentAudioInputMode === 'ptt' ? (
              <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50`}
                disabled={sessionStatus !== "CONNECTED" || isSwitchingInProgress || isIntroAudioPlaying} > {isPTTUserSpeaking ? "Listening..." : "Push to Talk"} </button>
            ) : (
              <div>
                <span className="text-lg text-gray-700">Microphone is always on (conversation mode)</span>
                {/* Optionally, render a mute button or indicator here */}
              </div>
            )}
          </div>
          
          {/* Use the new AgentSwitcher component */}
          <AgentSwitcher 
            currentAgentConfig={currentAgentConfig}
            patientAgent={patientAgent}
            preceptorAgent={preceptorAgent}
            disableAgentSwitchers={disableAgentSwitchers}
            isIntroAudioPlaying={isIntroAudioPlaying}
            onSelectAgent={handleAvatarAgentSelect}
          />
        </div>
      </div>

      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
      
      {/* Token Count Display */}
      <TokenCountDisplay />
      
      <BottomBar 
        sessionStatus={sessionStatus}
        currentAgentConfig={currentAgentConfig}
        isSwitchingInProgress={isSwitchingInProgress}
        isIntroAudioPlaying={isIntroAudioPlaying}
        onToggleConnection={onToggleConnection}
        onNavigateToWrite={handleNavigateToWrite}
        onCreateDDx={handleCreateDDx}
        isWritePage={false}
      />
    </div>
  );
}

export default function KatoSpeakPage() { 
  return (
    <KatoSpeakPageContent />
  );
}

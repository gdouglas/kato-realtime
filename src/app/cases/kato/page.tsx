"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { LuWifiOff, LuLoader, LuInfo } from "react-icons/lu";
import { useRouter } from "next/navigation";
import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";
import KatoIntroScreen from "@/app/components/KatoIntroScreen";
import CaseInfoModal from "@/app/components/CaseInfoModal";

// Types
import { AgentConfig, SessionStatus, TranscriptItem } from "@/app/types";

// Context providers & hooks
import { TranscriptProvider, useTranscript } from "@/app/contexts/TranscriptContext";
import { EventProvider, useEvent } from "@/app/contexts/EventContext";
import { useEventBus, EventBusProvider } from "@/app/contexts/EventBusContext"; // EDA

// Utilities
import { createRealtimeConnection } from "@/app/lib/realtimeConnection";
import { katoCaseDetails } from "@/app/cases/kato/katoCaseData";
import { KatoEvents } from "@/app/cases/kato/KatoEvents";

// Specific Agent config
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

// Hooks
import useAudioDownload from "@/app/hooks/useAudioDownload";
import { useKatoRTC } from "@/app/hooks/useKatoRTC"; // IMPORT ADDED
import { useIntroAudio } from "@/app/hooks/useIntroAudio"; // IMPORT ADDED
import { useAgentManager } from "@/app/hooks/useAgentManager"; // IMPORT AGENT MANAGER

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const createServerEventHandler = (
  eventBus: ReturnType<typeof useEventBus>,
) => {
  return (serverMessage: any) => {
    eventBus.emit(KatoEvents.SERVER_MESSAGE_RECEIVED, serverMessage);

    if (serverMessage.type === "session.status.updated") {
      eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, serverMessage.status as SessionStatus);
    } else if (serverMessage.type === "session.created") {
      console.log("[ServerEventHandler] Received 'session.created':", serverMessage);
      if (serverMessage.session?.id) {
        eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, "CONNECTED");
        // Optionally, add a breadcrumb here if useful
        // addTranscriptBreadcrumb(`Server session active: ${serverMessage.session.id}`);
      }
    } else if (serverMessage.type === "conversation.item.created") {
        if (serverMessage.item && serverMessage.item.role && serverMessage.item.content) {
        let textContent = "";
        if (Array.isArray(serverMessage.item.content) && serverMessage.item.content[0]?.type === "output_text") {
            textContent = serverMessage.item.content[0].text;
        } else if (typeof serverMessage.item.content === "string") { 
            textContent = serverMessage.item.content;
        }

        if (textContent) {
             const transcriptDataForEvent = {
                serverId: serverMessage.item.id, 
                idToAssign: serverMessage.item.id || uuidv4().slice(0,32), 
                role: serverMessage.item.role,
                title: textContent, 
                status: serverMessage.item.status || (serverMessage.item.role === "assistant" ? "IN_PROGRESS" : "COMPLETE"),
                isLocal: false,
                timestamp: serverMessage.item.timestamp || new Date().toISOString(),
             };
             eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM, transcriptDataForEvent);
        }
      }
    } else if (serverMessage.type === "output_audio_buffer.status") {
      const isActive = serverMessage.is_active === true;
      eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, isActive);
      if (isActive) {
        eventBus.emit(KatoEvents.SERVER_OUTPUT_AUDIO_STARTED);
      } else {
        eventBus.emit(KatoEvents.SERVER_OUTPUT_AUDIO_ENDED);
      }
    } else if (serverMessage.type === "response.cancelled") {
        eventBus.emit(KatoEvents.SERVER_AGENT_RESPONSE_CANCELLED);
    } else if (serverMessage.type === "session.updated") {
        eventBus.emit(KatoEvents.SERVER_SESSION_UPDATED_ACK);
        if (serverMessage.session?.status) {
             eventBus.emit(KatoEvents.SERVER_SESSION_STATUS_UPDATE, serverMessage.session.status as SessionStatus);
        }
    }
  };
};

function KatoPageEdaContent() {
  const eventBus = useEventBus();
  const router = useRouter();
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const urlCodec = "opus";

  // --- State for intro screen visibility ---
  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(true);
  // --- State for case info modal visibility ---
  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);

  // Agent state (selectedAgentName, currentAgentConfig, etc.) is now managed by useAgentManager.

  const audioElementRef = useRef<HTMLAudioElement | null>(null); 
  const [userText, setUserText] = useState<string>("");
  const [uiMode, setUiMode] = useState<"avatar" | "text">("avatar");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<"conversation" | "ptt" | "no_mic">("conversation");
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(true);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState<boolean>(false);
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [showMicDeniedModal, setShowMicDeniedModal] = useState<boolean>(false);

  const linePositioningParentRef = useRef<HTMLDivElement>(null);
  const userAvatarCircleRef = useRef<HTMLDivElement>(null);
  const patientAvatarCircleRef = useRef<HTMLDivElement>(null);
  const preceptorAvatarCircleRef = useRef<HTMLDivElement>(null);
  const indicatorLineRef = useRef<HTMLDivElement>(null);
  const [indicatorTargets, setIndicatorTargets] = useState({ user: 0, agent: 0 });
  const [activeSpeakerTurn, setActiveSpeakerTurn] = useState<"user" | "patient" | "preceptor" | "none">("none");

  const hasDoneInitialAgentSetupRef = useRef<boolean>(false);
  const isInitialAgentConnectionRef = useRef<boolean>(true);
  
  const { startRecording, stopRecording, downloadRecording } = useAudioDownload();
  const handleServerEventRef = useRef(createServerEventHandler(eventBus));

  // --- Initialize KatoRTC Hook ---
  const { sessionStatus, dcRef, manualDisconnect } = useKatoRTC({ 
    isAudioPlaybackEnabled,
    urlCodec,
    handleServerEvent: handleServerEventRef.current,
  });

  // --- Initialize AgentManager Hook ---
  const { 
    agentConfigs,
    selectedAgentName, 
    currentAgentConfig, 
    patientAgent,
    preceptorAgent 
  } = useAgentManager({
    initialAgentConfigs: medicalHistoryTakingAgents, 
    sessionStatus,
    addTranscriptBreadcrumb
  });

  // --- Initialize IntroAudio Hook ---
  const { isIntroAudioPlaying } = useIntroAudio({
    addTranscriptBreadcrumb,
    sessionStatus, 
    manualDisconnect, 
    currentAgentConfig, 
  });

  const introButtonClickedRef = useRef(false); // Ref to track explicit intro button clicks

  // --- Event Subscriptions for State Updates & Side Effects ---

  useEffect(() => {
    if (showIntroScreen) {
      // Reset the flag when returning to (or initially on) the intro screen
      introButtonClickedRef.current = false;
    } else {
      // We are not on the intro screen. 
      // Only set a default agent if an intro button was NOT clicked to exit the intro screen,
      // AND no agent is currently selected (as a safeguard).
      if (!introButtonClickedRef.current && !selectedAgentName) {
        const defaultAgentName = medicalHistoryTakingAgents.find((a: AgentConfig) => a.name === "preceptor")?.name || medicalHistoryTakingAgents[0]?.name || "";
        if (defaultAgentName) {
            console.log(`[PageDebug] Setting default agent. Conditions met. Agent: ${defaultAgentName}`);
            eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: defaultAgentName });
        }
      }
    }
  }, [showIntroScreen, selectedAgentName, eventBus]); // Dependencies

  useEffect(() => {
    const handleAgentChangedPageLogic = (data: { newAgentName: string, oldAgentName?: string, agentConfig?: AgentConfig }) => {
      hasDoneInitialAgentSetupRef.current = false;
    };
    const subChange = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChangedPageLogic);
    return () => {
      subChange();
    };
  }, [eventBus]); 

  useEffect(() => {
    const handleConnectionEstablished = () => {
      console.log("[ConnectionFlow] handleConnectionEstablished triggered (Data channel open).");
      addTranscriptBreadcrumb("Data channel open.");
    };
    const handleConnectionFailed = (error: Error) => {
      console.error("Error connecting to realtime:", error);
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
        console.log("[ConnectionFlow] performUpdateSession triggered. Data:", data);
        if (!currentAgentConfig) {
          console.warn("[ConnectionFlow] currentAgentConfig is null in performUpdateSession. Aborting.");
      return;
    }
        // Detailed log for the agent config being used
        console.log(`[ConnectionFlow] performUpdateSession using agent: ${currentAgentConfig.name}, instructions: '${currentAgentConfig.instructions}', voice: '${currentAgentConfig.voice}'`);

        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
            eventObj: { type: "input_audio_buffer.clear" },
            eventNameSuffix: "clear audio buffer on session update"
        });

    let turnDetectionConfig: any = null;
    let modalitiesConfig = ["text", "audio"];
        let transcriptionConfig: any = { model: "whisper-1", language: "en" };

    if (currentAudioInputMode === "no_mic") {
      modalitiesConfig = ["text"];
            transcriptionConfig = null;
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
        console.log("[ConnectionFlow] Sending session.update event to server:", sessionUpdateEvent);
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: sessionUpdateEvent, eventNameSuffix: "session.update" });

        if (data?.shouldTriggerResponse) {
            console.log("[ConnectionFlow] shouldTriggerResponse is true. Sending initial 'Hi' message.");
            const id = uuidv4().slice(0, 32);
             addTranscriptMessage(id, "user", "Hi", true);
             eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
                eventObj: { type: "conversation.item.create", item: { id, type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] } },
                eventNameSuffix: "(simulated hi for agent switch)"
             });
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response after agent switch)" });
        }
    };
    return eventBus.on(KatoEvents.SESSION_UPDATE_REQUESTED, performUpdateSession);
  }, [eventBus, currentAgentConfig, currentAudioInputMode, addTranscriptMessage]);

  // Define cancelAssistantSpeechLogic before handleSendTextMessage
  const cancelAssistantSpeechLogic = useCallback(() => {
    const mostRecentAssistantMessage = [...transcriptItems]
      .reverse()
      .find((item) => item.role === "assistant");
    
    if (mostRecentAssistantMessage?.status === "IN_PROGRESS") {
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.cancel" }, eventNameSuffix: "(cancel due to user interruption)"});
    }
    if (isOutputAudioBufferActive) { 
      eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "output_audio_buffer.clear" }, eventNameSuffix: "(cancel due to user interruption)"});
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
            eventNameSuffix: "(send user text message)"
        });
    setUserText("");
        eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "(trigger response)" });
    };
    return eventBus.on(KatoEvents.USER_SENT_TEXT_MESSAGE, handleSend);
  }, [eventBus, addTranscriptMessage]);
  
  useEffect(() => {
    const handleServerTranscript = (data: { 
      idToAssign: string, 
      role: 'user' | 'assistant', 
      title: string, 
      isLocal?: boolean, 
      status?: string 
    }) => {
        addTranscriptMessage(data.idToAssign, data.role, data.title, data.isLocal);
    };
    return eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM, handleServerTranscript);
  }, [eventBus, addTranscriptMessage]);

  useEffect(() => {
    return eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, setIsOutputAudioBufferActive);
  }, [eventBus, setIsOutputAudioBufferActive]);

  // --- Audio Interaction Modal State Manager ---
  useEffect(() => {
    const handleVisibilityChange = (isVisible: boolean) => {
      setShowAudioInteractionModal(isVisible);
    };
    const subVisibility = eventBus.on(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, handleVisibilityChange);
    
    const handleUserConfirmation = () => {
      setShowAudioInteractionModal(false);
      eventBus.emit(KatoEvents.AUDIO_MODAL_VISIBILITY_CHANGED, false); 
    };
    const subConfirmation = eventBus.on(KatoEvents.USER_CONFIRMED_AUDIO_MODAL, handleUserConfirmation);

    return () => {
      subVisibility();
      subConfirmation();
    };
  }, [eventBus]);

  // --- PTT User Speaking State Manager ---
  useEffect(() => {
    const handleTalkStart = () => {
    setIsPTTUserSpeaking(true);
      eventBus.emit(KatoEvents.PTT_USER_SPEAKING_CHANGED, true);
    };
    const handleTalkEnd = () => {
    setIsPTTUserSpeaking(false);
      eventBus.emit(KatoEvents.PTT_USER_SPEAKING_CHANGED, false);
    };

    const subStart = eventBus.on(KatoEvents.USER_REQUESTED_TALK_START, handleTalkStart);
    const subEnd = eventBus.on(KatoEvents.USER_REQUESTED_TALK_END, handleTalkEnd);

    return () => {
      subStart();
      subEnd();
    };
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

  const handleSendTextMessage = useCallback(() => {
    if (!userText.trim()) return;
    cancelAssistantSpeechLogic(); 
    const messageId = uuidv4().slice(0,32);
    eventBus.emit(KatoEvents.USER_SENT_TEXT_MESSAGE, { text: userText.trim(), id: messageId });
  }, [userText, eventBus, cancelAssistantSpeechLogic]); 

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: newAgentName });
  }, [eventBus]);

  useEffect(() => {
    return eventBus.on(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH, cancelAssistantSpeechLogic);
  }, [eventBus, cancelAssistantSpeechLogic]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open") return;
    eventBus.emit(KatoEvents.USER_INTERRUPTED_ASSISTANT_SPEECH);
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_START);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.clear" }, eventNameSuffix: "clear PTT buffer" });
  }, [sessionStatus, eventBus]);

  const handleTalkButtonUp = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dcRef.current?.readyState !== "open" || !isPTTUserSpeaking) return;
    eventBus.emit(KatoEvents.USER_REQUESTED_TALK_END);
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "input_audio_buffer.commit" }, eventNameSuffix: "commit PTT" });
    eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, { eventObj: { type: "response.create" }, eventNameSuffix: "trigger response PTT" });
  }, [sessionStatus, isPTTUserSpeaking, eventBus]);
  
  const handleCreateDDx = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      addTranscriptBreadcrumb("Disconnecting session before navigating to DDx page...");
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, {isSwitchingAgent: false}); 
    }
    router.push('/cases/kato/ddx');
  }, [router, sessionStatus, eventBus, addTranscriptBreadcrumb]);

  useEffect(() => {
    const calculatePositions = () => {
      const parentEl = linePositioningParentRef.current;
      const userCircleEl = userAvatarCircleRef.current;
      const lineEl = indicatorLineRef.current;
      let activeAgentCircleEl: HTMLDivElement | null = null;

      if (currentAgentConfig?.name === patientAgent?.name) {
        activeAgentCircleEl = patientAvatarCircleRef.current;
      } else if (currentAgentConfig?.name === preceptorAgent?.name) {
        activeAgentCircleEl = preceptorAvatarCircleRef.current;
      }
      if (parentEl && userCircleEl && activeAgentCircleEl && lineEl) {
        const parentRect = parentEl.getBoundingClientRect();
        const userCircleRect = userCircleEl.getBoundingClientRect();
        const agentCircleRect = activeAgentCircleEl.getBoundingClientRect();
        const actualIndicatorWidth = lineEl.getBoundingClientRect().width;

            if (parentRect.width === 0 || userCircleRect.width === 0 || agentCircleRect.width === 0 || actualIndicatorWidth === 0) return;

        const userCircleCenterX = (userCircleRect.left - parentRect.left) + (userCircleRect.width / 2);
        const userIndicatorX = userCircleCenterX - (actualIndicatorWidth / 2);
        const agentCircleCenterX = (agentCircleRect.left - parentRect.left) + (agentCircleRect.width / 2);
        const agentIndicatorX = agentCircleCenterX - (actualIndicatorWidth / 2);
        
        setIndicatorTargets({ user: userIndicatorX, agent: agentIndicatorX });
      }
    };
    calculatePositions(); 
    const timeoutId = setTimeout(calculatePositions, 50); 
    window.addEventListener('resize', calculatePositions);
    return () => { clearTimeout(timeoutId); window.removeEventListener('resize', calculatePositions); };
  }, [currentAgentConfig, patientAgent, preceptorAgent]);

  useEffect(() => {
    let newTurn: 'user' | 'patient' | 'preceptor' | 'none' = 'none';

    if (isIntroAudioPlaying) { 
      newTurn = currentAgentConfig?.name === patientAgent?.name ? "patient" : (currentAgentConfig?.name === preceptorAgent?.name ? "preceptor" : "none"); 
    } else if (isOutputAudioBufferActive) {
      if (currentAgentConfig?.name === patientAgent?.name) newTurn = "patient";
      else if (currentAgentConfig?.name === preceptorAgent?.name) newTurn = "preceptor";
    } else {
      newTurn = "user";
    }
    setActiveSpeakerTurn(newTurn);
  }, [isIntroAudioPlaying, isOutputAudioBufferActive, currentAgentConfig, patientAgent, preceptorAgent]);

  // --- PTT Active State Manager (New) ---
  useEffect(() => {
    const handleAudioInputModeChange = (newMode: 'conversation' | 'ptt' | 'no_mic') => {
      if (newMode === 'ptt') {
        eventBus.emit(KatoEvents.PTT_ACTIVE_CHANGED, true);
      } else {
        eventBus.emit(KatoEvents.PTT_ACTIVE_CHANGED, false);
      }
    };
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    return () => sub();
  }, [eventBus]);

  useEffect(() => {
    const handlePttActiveChange = (isActive: boolean) => {
      setIsPTTActive(isActive);
    };
    const sub = eventBus.on(KatoEvents.PTT_ACTIVE_CHANGED, handlePttActiveChange);
    return () => sub();
  }, [eventBus]);
  // End of New PTT Active State Manager

  // --- UI Mode State Manager ---
  useEffect(() => {
    const handleUiModeChange = (newMode: "avatar" | "text") => {
      setUiMode(newMode);
    };
    const sub = eventBus.on(KatoEvents.UI_MODE_CHANGED, handleUiModeChange);
    return () => sub();
  }, [eventBus]);

  // --- Audio Input Mode State Manager ---
  useEffect(() => {
    const handleAudioInputModeChange = (newMode: "conversation" | "ptt" | "no_mic") => {
      setCurrentAudioInputMode(newMode);
    };
    // Note: This subscription is separate from the one that triggers PTT_ACTIVE_CHANGED
    // to allow other parts of the system to react purely to audio input mode changes if needed,
    // and to keep state updates distinct.
    const sub = eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChange);
    return () => sub();
  }, [eventBus]);

  // --- Audio Playback Enabled State Manager ---
  useEffect(() => {
    const handleAudioPlaybackEnabledChange = (isEnabled: boolean) => {
      setIsAudioPlaybackEnabled(isEnabled);
      if (audioElementRef.current) {
        audioElementRef.current.autoplay = isEnabled;
      }
    };
    const sub = eventBus.on(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, handleAudioPlaybackEnabledChange);
    return () => sub();
  }, [eventBus]);

  // --- SEND_MESSAGE_TO_SERVER Handler ---
  useEffect(() => {
    const handleSendMessageToServer = (data: { eventObj: any, eventNameSuffix?: string }) => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        const messagePayload = JSON.stringify(data.eventObj);
        let agentIdentifierForLog = "N/A";
        if (data.eventObj.type === "session.update" && data.eventObj.session?.instructions) {
          // Attempt to get a short part of instructions or agent name if available
          agentIdentifierForLog = data.eventObj.session.instructions.substring(0, 50) + "...";
        } else if (data.eventObj.item?.role) {
          agentIdentifierForLog = `Role: ${data.eventObj.item.role}`;
        }

        console.log(`[MESSAGE_SENT_TO_DC] Event Type: ${data.eventObj.type}, Details: ${agentIdentifierForLog}, Voice (if session.update): ${data.eventObj.session?.voice || 'N/A'}, Full Payload: ${messagePayload}`);
        logClientEvent(data.eventObj, data.eventNameSuffix); 
        dcRef.current.send(messagePayload);
      } else {
        console.error(`[MESSAGE_SENT_TO_DC_ERROR] Data channel not open or dcRef is null. Cannot send. Event Type: ${data.eventObj.type}`);
        addTranscriptBreadcrumb("Error: Data channel not open, cannot send message.");
        logClientEvent({ attemptedEvent: data.eventObj.type, error: "dc_not_open" }, `error.data_channel_not_open_for_${data.eventNameSuffix || 'unknown_event'}`);
      }
    };

    const unsubscribe = eventBus.on(KatoEvents.SEND_MESSAGE_TO_SERVER, handleSendMessageToServer);
    return () => unsubscribe();
  }, [eventBus, dcRef, logClientEvent, addTranscriptBreadcrumb]); // dcRef from useKatoRTC

  // New useEffect to handle sending initial session update once connected and agent is ready
  useEffect(() => {
    console.log(`[SessionUpdateTrigger] Evaluating. Status: ${sessionStatus}, Agent: ${currentAgentConfig?.name}, InitialSetupDone: ${hasDoneInitialAgentSetupRef.current}`);
    if (sessionStatus === "CONNECTED" && currentAgentConfig && !hasDoneInitialAgentSetupRef.current) {
      console.log("[SessionUpdateTrigger] Conditions met. Emitting SESSION_UPDATE_REQUESTED.");
      addTranscriptBreadcrumb(`Agent ${currentAgentConfig.name} ready, configuring session.`);
      eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { shouldTriggerResponse: !isInitialAgentConnectionRef.current });
      if (isInitialAgentConnectionRef.current) {
        isInitialAgentConnectionRef.current = false;
      }
      hasDoneInitialAgentSetupRef.current = true; // Mark that this initial update has been requested for this agent & connection cycle
    }
  }, [sessionStatus, currentAgentConfig, eventBus, addTranscriptBreadcrumb]); // Added addTranscriptBreadcrumb to deps

  useEffect(() => {
    const handleAudioSettingsChange = () => {
        if(sessionStatus === "CONNECTED" && currentAgentConfig) {
            console.log(`Requesting session update due to audio settings change: PTT=${isPTTActive}, Mode=${currentAudioInputMode}`);
            eventBus.emit(KatoEvents.SESSION_UPDATE_REQUESTED, { shouldTriggerResponse: false });
        }
    };
    if (sessionStatus === "CONNECTED" && currentAgentConfig) {
      console.log(`Audio settings changed: PTT=${isPTTActive}, Mode=${currentAudioInputMode}. Requesting session update if connected.`);
      handleAudioSettingsChange(); 
    }

  }, [isPTTActive, currentAudioInputMode, sessionStatus, eventBus, currentAgentConfig]);

  // Effect to listen for mic denied modal request from the hook
  useEffect(() => {
    const showModal = () => setShowMicDeniedModal(true);
    const sub = eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, showModal);
    return () => sub();
  }, [eventBus]);

  const isDisconnectedOrErrorState = sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR"; // sessionStatus from hook

  // --- Log states for avatar debugging ---
  console.log("[AvatarDebug] Render time states:", {
    selectedAgentName,
    currentAgentConfigName: currentAgentConfig?.name,
    isPatientAgentDefined: !!patientAgent, 
    isPreceptorAgentDefined: !!preceptorAgent, 
    patientAgentName: patientAgent?.name, 
    preceptorAgentName: preceptorAgent?.name, 
    selectedAgentConfigSetLength: agentConfigs?.length 
  });

  // --- Handlers for Intro Screen buttons ---
  const handleStartWithPatient = () => {
    introButtonClickedRef.current = true; // Mark explicit choice
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: "mrKato" });
    setShowIntroScreen(false);
  };

  const handleStartWithPreceptor = () => {
    introButtonClickedRef.current = true; // Mark explicit choice
    eventBus.emit(KatoEvents.USER_SELECTED_AGENT, { agentName: "preceptor" });
    setShowIntroScreen(false);
  };

  // --- JSX Rendering (largely similar, but event emitters in handlers) ---
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {showMicDeniedModal && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Microphone Access Denied</h3>
              <p className="mb-6 text-gray-600">
                Voice interaction requires microphone access. You have been switched to text input mode.
                You can change your microphone permissions in your browser settings and reconnect if you wish to use voice.
              </p>
              <button
                onClick={() => setShowMicDeniedModal(false)}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {showAudioInteractionModal && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Audio Interaction</h3>
              <p className="mb-6 text-gray-600">
                This application works best as an audio-based conversation. Please ensure your
                microphone and speakers (or headphones) are enabled.
              </p>
              <button
                onClick={() => eventBus.emit(KatoEvents.USER_CONFIRMED_AUDIO_MODAL)}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Let's Get Started!
              </button>
            </div>
          </div>
        )}

        {uiMode === 'avatar' && (
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-3xl relative h-full">
            <div ref={linePositioningParentRef} className="relative flex justify-around w-full items-start mt-8">
              {/* User Avatar */}
              <div className="flex flex-col items-center text-center w-1/3"> 
                <div ref={userAvatarCircleRef} className={`box-content relative w-32 h-32 border-4 border-blue-500 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-3xl font-semibold shadow-lg`}>
                  <span style={{ position: 'relative', zIndex: 1 }}>You</span>
                  {isPTTUserSpeaking && (
                    <> <div className="radiating-ring"></div> <div className="radiating-ring"></div> <div className="radiating-ring"></div> </>
                  )}
                </div>
              </div>
              {/* Active Agent Avatar */}
              <div className="flex flex-col items-center text-center w-1/3"> 
                {currentAgentConfig?.name === patientAgent?.name && patientAgent && (
                  <div ref={patientAvatarCircleRef} className={`box-content relative w-32 h-32 border-4 border-green-500 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold shadow-lg cursor-default`} title={`${patientAgent.publicDescription} (Active)`}>
                    <div className="flex flex-col items-center "><span className="text-3xl mt-5">Patient</span><div className="mt-1 text-xs font-medium text-gray-700">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</div></div>
                        </div>
                )}
                {currentAgentConfig?.name === preceptorAgent?.name && preceptorAgent && (
                  <div ref={preceptorAvatarCircleRef} className={`box-content relative w-32 h-32 border-4 border-purple-500 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-semibold shadow-lg cursor-default`} title={`${preceptorAgent.publicDescription} (Active)`}>
                      <span className="text-2xl">Preceptor</span>
                    </div>
                )}
              </div>
              {/* Status Indicators */}
              <div className="absolute inset-x-0 bottom-[-32px] h-8">
                <AnimatePresence mode="wait">
                  {sessionStatus === "CONNECTING" && ( <motion.div key="spinner" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.2 }} className="flex items-center justify-center h-full w-full"> <LuLoader className="animate-spin text-gray-500" size={24} /> </motion.div> )}
                  {(sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") && ( <motion.div key="disconnected-icon" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.2 }} className="flex items-center justify-center h-full w-full"> <LuWifiOff size={24} className={sessionStatus === "ERROR" ? "text-red-500" : "text-gray-500"} /> </motion.div> )}
                  {sessionStatus === "CONNECTED" && (
                    <motion.div key="line-indicator-system" className="relative w-full h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <motion.div ref={indicatorLineRef} className="absolute h-1 w-24 top-1/2 -translate-y-1/2"
                        variants={{ user: { x: indicatorTargets.user, opacity: 1, backgroundColor: "rgb(59 130 246)" }, patient: { x: indicatorTargets.agent, opacity: 1, backgroundColor: "rgb(34 197 94)" }, preceptor: { x: indicatorTargets.agent, opacity: 1, backgroundColor: "rgb(168 85 247)" }, none: { opacity: 0 } }}
                        animate={activeSpeakerTurn} initial="none" transition={{ duration: 0.4, ease: "easeInOut" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {/* PTT Button */}
            <div className="mt-12">
              {isPTTActive ? (
                <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                  className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"} > {isPTTUserSpeaking ? "Listening..." : "Push to Talk"} </button>
              ) : (
                <button onClick={() => { if (sessionStatus === "CONNECTED") { eventBus.emit(KatoEvents.PTT_ACTIVE_CHANGED, true); eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "ptt"); } }}
                  className={`px-8 py-4 rounded-lg text-gray-700 font-semibold transition-colors shadow-md border border-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"} > Switch to Push-to-Talk </button>
              )}
            </div>
            {/* Inactive Agent Toggles */}
            <div className="absolute bottom-6 left-6 flex flex-col space-y-4">
              {currentAgentConfig?.name !== patientAgent?.name && patientAgent && (
                <div onClick={() => handleAvatarAgentSelect(patientAgent.name)} title={`Switch to ${patientAgent.publicDescription}`}
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out hover:bg-green-100 shadow-md hover:shadow-lg`}>
                  <div className={`w-20 h-20 border-2 border-green-400 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-xl font-semibold`}>Patient</div>
                  <span className="mt-1 text-xs font-medium text-gray-600">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
                </div>
              )}
              {currentAgentConfig?.name !== preceptorAgent?.name && preceptorAgent && (
                 <div onClick={() => handleAvatarAgentSelect(preceptorAgent.name)} title={`Switch to ${preceptorAgent.publicDescription}`}
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out hover:bg-purple-100 shadow-md hover:shadow-lg`}>
                  <div className={`w-20 h-20 border-2 border-purple-400 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 text-xl font-semibold`}><span className="text-xs">Preceptor</span></div>
                  <span className="mt-1 text-xs font-medium text-gray-600">&nbsp;</span>
                </div>
              )}
            </div>
          </div>
        )}

        {uiMode === 'text' && (
          <div className="w-full h-full flex flex-col bg-white rounded-lg shadow">
            <Transcript userText={userText} setUserText={setUserText} onSendMessage={handleSendTextMessage} downloadRecording={downloadRecording}
              canSend={sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open"}
              selectedAgentName={selectedAgentName} // from useAgentManager
              patientAgent={patientAgent || null} // from useAgentManager
              preceptorAgent={preceptorAgent || null} // from useAgentManager
              handleAvatarAgentSelect={handleAvatarAgentSelect} // now emits USER_SELECTED_AGENT
            />
            {/* Conditionally render PTT button section in text mode only if currentAudioInputMode is 'ptt' */}
            {uiMode === 'text' && currentAudioInputMode === 'ptt' && (
              <div className="p-4 flex justify-center items-center bg-gray-50">
                 <button onMouseDown={handleTalkButtonDown} onMouseUp={handleTalkButtonUp} onTouchStart={handleTalkButtonDown} onTouchEnd={handleTalkButtonUp}
                  className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed`}
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
                <input type="checkbox" checked={isAudioPlaybackEnabled} onChange={(e) => eventBus.emit(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, e.target.checked)} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                <span className="ms-3 text-sm font-medium text-gray-800">Audio Playback</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4">
        <div></div> 
        <div className="flex items-center space-x-4"> 
          <button onClick={onToggleConnection}
            className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "bg-red-500 hover:bg-red-600 focus:ring-red-300" : "bg-green-500 hover:bg-green-600 focus:ring-green-300"} focus:outline-none focus:ring-2 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!currentAgentConfig && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")} >
            {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "Disconnect" : "Connect"}
          </button>
          {uiMode === 'avatar' && (
            <button onClick={() => { eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text'); eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "ptt");}}
              className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"> Write </button>
          )}
          {uiMode === 'text' && (
            <button onClick={() => { eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'avatar'); eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, "conversation");}}
              className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"> Speak </button>
          )}
        </div>
        <div> 
          <button onClick={handleCreateDDx}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400">
            Create a DDx
          </button>
        </div>
      </div>
      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
    </div>
  );
}

export default function KatoPageEda() { 
  return (
    <TranscriptProvider>
      <EventProvider>
        <EventBusProvider> 
          <KatoPageEdaContent />
        </EventBusProvider>
      </EventProvider>
    </TranscriptProvider>
  );
}
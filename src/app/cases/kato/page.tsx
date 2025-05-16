"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
// Removed useSearchParams as agentConfig is fixed
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";
// import Events from "@/app/components/Events"; // Removed
// import BottomToolbar from "@/app/components/BottomToolbar"; // Removed

// Types
import { AgentConfig, SessionStatus } from "@/app/types"; // Adjusted path

// Context providers & hooks
import { TranscriptProvider, useTranscript } from "@/app/contexts/TranscriptContext"; // Ensured Provider is imported
import { EventProvider, useEvent } from "@/app/contexts/EventContext"; // Ensured Provider is imported
import { useHandleServerEvent } from "@/app/hooks/useHandleServerEvent"; // Adjusted path

// Utilities
import { createRealtimeConnection } from "@/app/lib/realtimeConnection"; // Adjusted path

// Specific Agent config for this page
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking"; // Adjusted path
// Removed allAgentSets and defaultAgentSetKey as they are not needed

// Define the base URL for your FastAPI backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

import useAudioDownload from "@/app/hooks/useAudioDownload"; // Adjusted path

// Component that contains the actual page logic, to be wrapped by providers
function KatoPageContent() {
  const urlCodec = "opus";
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    AgentConfig[] | null
  >(null);

  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [manualDisconnect, setManualDisconnect] = useState<boolean>(false);

  // const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
  //   useState<boolean>(true); // Default to true or load from localStorage if needed // REMOVED
  const [userText, setUserText] = useState<string>("");
  
  const [uiMode, setUiMode] = useState<"avatar" | "text">("avatar");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false); // PTT disabled by default, server VAD is default
  const [currentAudioInputMode, setCurrentAudioInputMode] = useState<"conversation" | "ptt" | "no_mic">("conversation");
  const [isIntroAudioPlaying, setIsIntroAudioPlaying] = useState<boolean>(false);

  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] =
    useState<boolean>(true); // Default or localStorage

  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] =
    useState<boolean>(false);

  const { startRecording, stopRecording, downloadRecording } =
    useAudioDownload();

  // Ref for the introductory audio element
  const introAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // State for the audio interaction modal
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [audioUrlForModalRetry, setAudioUrlForModalRetry] = useState<string | null>(null);
  const [audioBlobForModalRetry, setAudioBlobForModalRetry] = useState<Blob | null>(null);

  // Ref to track if initial setup for the current agent has been done
  const hasDoneInitialAgentSetupRef = useRef<boolean>(false);
  // Ref to track if this is the very first agent connection for the page load
  const isInitialAgentConnectionRef = useRef<boolean>(true);
  // Ref to track agents whose intro audio has already been played this session
  const playedIntroForAgentsRef = useRef(new Set<string>());

  // State to track the active speaker for UI indication
  const [activeSpeakerTurn, setActiveSpeakerTurn] = useState<
    "user" | "patient" | "preceptor" | "none"
  >("none");

  // Ref to store the previous state of isOutputAudioBufferActive
  const prevIsOutputAudioBufferActiveRef = useRef<boolean>(false);

  const sendClientEvent = useCallback((eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      logClientEvent(eventObj, eventNameSuffix);
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      logClientEvent(
        { attemptedEvent: eventObj.type },
        "error.data_channel_not_open"
      );
      // console.error( // Already logged by useEvent hook
      //   "Failed to send message - no data channel available",
      //   eventObj
      // );
      addTranscriptMessage(uuidv4().slice(0,32), "assistant", "Error: Data channel not open. Cannot send message.", false);
    }
  }, [logClientEvent, addTranscriptMessage]);

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet,
    sendClientEvent,
    setSelectedAgentName,
    setIsOutputAudioBufferActive,
  });

  const fetchEphemeralKey = useCallback(async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch(`${API_BASE_URL}/api/v1/session`, {
      method: "POST",
    });
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("ERROR");
      addTranscriptBreadcrumb("Failed to fetch session token. Connection aborted.");
      return null;
    }
    return data.client_secret.value;
  }, [logClientEvent, logServerEvent, setSessionStatus, addTranscriptBreadcrumb]);

  const connectToRealtime = useCallback(async () => {
    if (sessionStatus === "CONNECTING" || sessionStatus === "CONNECTED" || sessionStatus === "ERROR") {
      console.warn(
        `connectToRealtime called while status is ${sessionStatus}. Aborting.`
      );
      return;
    }
    setManualDisconnect(false);
    setSessionStatus("CONNECTING");
    addTranscriptBreadcrumb("Connecting to Realtime...");

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) {
        return;
      }
      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
      }
      audioElementRef.current.autoplay = isAudioPlaybackEnabled;

      const { pc, dc } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef,
        urlCodec
      );
      pcRef.current = pc;
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        logClientEvent({}, "data_channel.open");
        // setSessionStatus is handled by useHandleServerEvent based on "session.status.updated"
        addTranscriptBreadcrumb("Data channel open.");
      });
      dc.addEventListener("close", () => {
        logClientEvent({}, "data_channel.close");
         // setSessionStatus("DISCONNECTED"); // This will be handled by onconnectionstatechange or server event
         addTranscriptBreadcrumb("Data channel closed.");
      });
      dc.addEventListener("error", (err: any) => {
        logClientEvent({ error: err }, "data_channel.error");
      });
      dc.addEventListener("message", (e: MessageEvent) => {
        handleServerEventRef.current(JSON.parse(e.data));
      });
      setDataChannel(dc);
    } catch (err) {
      console.error("Error connecting to realtime:", err);
      setSessionStatus("ERROR");
      addTranscriptBreadcrumb(`Error connecting: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [sessionStatus, fetchEphemeralKey, isAudioPlaybackEnabled, urlCodec, logClientEvent, handleServerEventRef, addTranscriptBreadcrumb, setSessionStatus]);

  const disconnectFromRealtime = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      pcRef.current.close();
      pcRef.current = null;
    }
    setDataChannel(null);
    setSessionStatus("DISCONNECTED");
    setIsPTTUserSpeaking(false);
    logClientEvent({}, "disconnected");
    addTranscriptBreadcrumb("Disconnected from Realtime.");
  }, [logClientEvent, addTranscriptBreadcrumb]);

  const sendSimulatedUserMessage = useCallback((text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);
    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      },
      "(simulated user text message)"
    );
    sendClientEvent(
      { type: "response.create" },
      "(trigger response after simulated user text message)"
    );
  }, [addTranscriptMessage, sendClientEvent]);

  const updateSession = useCallback((shouldTriggerResponse: boolean = false) => {
    sendClientEvent(
      { type: "input_audio_buffer.clear" },
      "clear audio buffer on session update"
    );
    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    let turnDetectionConfig: any = null;
    let modalitiesConfig = ["text", "audio"];
    let transcriptionConfig: any = {
      model: "whisper-1",
      language: "en",
    };

    if (currentAudioInputMode === "no_mic") {
      modalitiesConfig = ["text"];
      transcriptionConfig = null; // No transcription if no mic
      // turnDetectionConfig remains null (PTT effectively, or server ignores with no audio modality)
    } else if (currentAudioInputMode === "conversation") {
      // This implies isPTTActive should be false for VAD
      turnDetectionConfig = {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
        create_response: true,
      };
    } else { // "ptt" mode
      // This implies isPTTActive should be true
      turnDetectionConfig = null;
    }

    const instructions = currentAgent?.instructions || "";
    const tools = currentAgent?.tools || [];
    const voice = currentAgent?.voice || "sage";
    const sessionUpdateEvent = {
      type: "session.update",
      session: {
        modalities: modalitiesConfig,
        instructions,
        voice,
        input_audio_transcription: transcriptionConfig,
        turn_detection: turnDetectionConfig,
        tools,
      },
    };
    sendClientEvent(sessionUpdateEvent);
    if (shouldTriggerResponse) {
      sendSimulatedUserMessage("hi");
    }
  }, [sendClientEvent, selectedAgentConfigSet, selectedAgentName, sendSimulatedUserMessage, currentAudioInputMode]);

  const playIntroductoryMessageThenConnect = useCallback(async (isRetryAfterModal = false) => {
    if (!isRetryAfterModal && (sessionStatus === "CONNECTING" || sessionStatus === "CONNECTED" || !selectedAgentName)) {
      console.warn(
        `playIntroductoryMessageThenConnect called while status is ${sessionStatus} or no agent selected. Aborting.`
      );
      return;
    }

    // If this agent's intro has already been played (or it has no intro and was thus marked), connect directly.
    if (playedIntroForAgentsRef.current.has(selectedAgentName)) {
      addTranscriptBreadcrumb(`Reconnecting to ${selectedAgentName} without replaying intro.`);
      setIsIntroAudioPlaying(false); // Ensure this is false
      connectToRealtime();
      return;
    }

    setIsIntroAudioPlaying(true); 
    addTranscriptBreadcrumb(isRetryAfterModal ? "Retrying introductory message playback..." : "Preparing introductory message...");

    const playAudioAndSetupHandlers = (audioSrcUrl: string, audioBlobToRevoke?: Blob) => {
      if (!introAudioElementRef.current) {
        introAudioElementRef.current = new Audio();
      }
      const audio = introAudioElementRef.current;
      const objectUrlToRevoke = audioSrcUrl;

      audio.src = audioSrcUrl;
      audio.play()
        .then(() => {
          addTranscriptBreadcrumb("Introductory message playing.");
          playedIntroForAgentsRef.current.add(selectedAgentName); // Mark intro as played for this agent
          setShowAudioInteractionModal(false); 
        })
        .catch(error => {
          console.error("Error playing introductory audio:", error);
          // Do not mark as played if play itself fails initially, allow retry from modal
          // playedIntroForAgentsRef.current.add(selectedAgentName); // Moved to .then()
          setIsIntroAudioPlaying(false); 
          if (error.name === "NotAllowedError" && !isRetryAfterModal) {
            addTranscriptBreadcrumb("Audio playback requires user interaction.");
            setAudioUrlForModalRetry(audioSrcUrl); 
            setAudioBlobForModalRetry(audioBlobToRevoke || null); 
            setShowAudioInteractionModal(true);
          } else {
            addTranscriptBreadcrumb(`Error playing intro: ${error.message}. Connecting directly.`);
            playedIntroForAgentsRef.current.add(selectedAgentName); // If other error, mark as attempt to play, then connect
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            if (audioBlobForModalRetry) setAudioBlobForModalRetry(null); 
            setAudioUrlForModalRetry(null);
            connectToRealtime();
          }
        });

      audio.onended = () => {
        // playedIntroForAgentsRef.current.add(selectedAgentName); // Already added in .then()
        setIsIntroAudioPlaying(false); 
        addTranscriptBreadcrumb("Introductory message finished. Connecting to Realtime...");
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        if (audioBlobForModalRetry) setAudioBlobForModalRetry(null);
        setAudioUrlForModalRetry(null);
        connectToRealtime();
      };

      audio.onerror = (e) => {
        // playedIntroForAgentsRef.current.add(selectedAgentName); // Already added in .then() or catch()
        setIsIntroAudioPlaying(false); 
        console.error("Error during audio playback (onerror):", e);
        addTranscriptBreadcrumb("Error during intro playback. Connecting directly.");
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        if (audioBlobForModalRetry) setAudioBlobForModalRetry(null);
        setAudioUrlForModalRetry(null);
        connectToRealtime();
      };
    };

    if (isRetryAfterModal && audioUrlForModalRetry) {
        playAudioAndSetupHandlers(audioUrlForModalRetry);
    } else if (!isRetryAfterModal) {
        const agentConfig = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
        const introText = agentConfig?.introAudio?.text;

        if (introText) {
            // If intro already played (checked at the top), this block is skipped.
            try {
                addTranscriptBreadcrumb("Fetching introductory audio...");
                const response = await fetch(`${API_BASE_URL}/api/v1/audio/speech`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input: introText,
                        model: agentConfig?.introAudio?.model || "gpt-4o-mini-tts",
                        voice: agentConfig?.introAudio?.voice || "shimmer",
                        instructions: agentConfig?.introAudio?.instructions,
                    }),
                });
                if (!response.ok) {
                    const errorData = await response.text();
                    throw new Error(`Failed to fetch introductory audio: ${response.status} ${errorData}`);
                }
                const newAudioBlob = await response.blob();
                const newAudioUrl = URL.createObjectURL(newAudioBlob);
                playAudioAndSetupHandlers(newAudioUrl, newAudioBlob);
            } catch (error: any) {
                setIsIntroAudioPlaying(false);
                playedIntroForAgentsRef.current.add(selectedAgentName); // Mark as attempted even if fetch fails
                console.error("Error fetching introductory message:", error);
                addTranscriptBreadcrumb(`Error fetching intro: ${error.message}. Connecting directly.`);
                connectToRealtime();
            }
        } else {
            setIsIntroAudioPlaying(false); 
            playedIntroForAgentsRef.current.add(selectedAgentName); // No intro text, mark as "introduced"
            addTranscriptBreadcrumb("No introductory message configured. Connecting to Realtime...");
            connectToRealtime();
        }
    } else {
        setIsIntroAudioPlaying(false); 
        // This case is for retry after modal, but something went wrong with audioUrlForModalRetry
        // We can assume if we got here, the intro attempt for this agent is done.
        playedIntroForAgentsRef.current.add(selectedAgentName); 
        console.warn("Retry called without valid audio URL. Connecting directly.");
        connectToRealtime();
    }
  }, [sessionStatus, selectedAgentName, selectedAgentConfigSet, connectToRealtime, addTranscriptBreadcrumb, audioUrlForModalRetry, setIsIntroAudioPlaying]);

  const handleModalOkAndRetryAudio = () => {
    setShowAudioInteractionModal(false);
    if (audioUrlForModalRetry) {
      playIntroductoryMessageThenConnect(true);
    } else {
      addTranscriptBreadcrumb("No audio to retry. Connecting directly.");
      connectToRealtime();
    }
  };

  // Initialize agent configuration for this specific page
  useEffect(() => {
    const agents = medicalHistoryTakingAgents; // Use the imported agents
    // Default to preceptor, or the first agent in the list
    const initialAgentName = agents.find(a => a.name === "preceptor")?.name || agents[0]?.name || "";

    setSelectedAgentName(initialAgentName);
    setSelectedAgentConfigSet(agents);
    addTranscriptBreadcrumb(`Case initialized. Default agent: ${initialAgentName}.`);
  }, [addTranscriptBreadcrumb]); // Run once on mount

  // Connect to Realtime when agent is selected and disconnected (and not manually disconnected)
  useEffect(() => {
    if (selectedAgentName && sessionStatus === "DISCONNECTED" && !manualDisconnect) {
      playIntroductoryMessageThenConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // TODO: connectToRealtime was removed from deps to prevent infinite loop.
    // Proper fix involves stabilizing connectToRealtime (and its dependency handleServerEventRef)
    // so it can be safely included in the dependency array. 
    // playIntroductoryMessageThenConnect is now a dependency.
  }, [selectedAgentName, sessionStatus, manualDisconnect, playIntroductoryMessageThenConnect]); // connectToRealtime REMOVED, playIntroductoryMessageThenConnect ADDED

  // Update session when connected (typically for new agent or fresh connection)
  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName &&
      !hasDoneInitialAgentSetupRef.current // Only run if initial setup for this agent hasn't been done
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Switched to Agent: ${currentAgent?.publicDescription || selectedAgentName}`, currentAgent);
      
      if (isInitialAgentConnectionRef.current) {
        updateSession(false); // Don't send "hi" on the very first agent connection
        isInitialAgentConnectionRef.current = false; // Mark that the initial connection has occurred
      } else {
        updateSession(true); // Send "hi" on subsequent agent switches
      }

      hasDoneInitialAgentSetupRef.current = true; // Mark setup as done for this agent session
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus, updateSession, addTranscriptBreadcrumb]);

  // Reset initial setup flag if the selected agent changes
  useEffect(() => {
    hasDoneInitialAgentSetupRef.current = false;
  }, [selectedAgentName]);

  // Reset initial setup flag if the session is truly disconnected or errors out
  useEffect(() => {
    if (sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") {
      hasDoneInitialAgentSetupRef.current = false;
    }
  }, [sessionStatus]);

  // Manage isPTTActive based on uiMode
  /* // REMOVED: isPTTActive is now user-controlled for avatar mode, not automatic based on uiMode.
  useEffect(() => {
    const newIsPTTActive = uiMode === 'avatar';
    if (newIsPTTActive !== isPTTActive) {
      setIsPTTActive(newIsPTTActive);
    }
  }, [uiMode, isPTTActive, setIsPTTActive]);
  */

  // Update session on PTT active change or audio input mode change
  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      console.log(
        `updatingSession due to state change: isPTTActive=${isPTTActive}, currentAudioInputMode=${currentAudioInputMode}, sessionStatus=${sessionStatus}`
      );
      updateSession();
    }
  }, [isPTTActive, currentAudioInputMode, sessionStatus, updateSession]);

  const cancelAssistantSpeech = useCallback(async () => {
    const mostRecentAssistantMessage = [...transcriptItems]
      .reverse()
      .find((item) => item.role === "assistant");
    if (!mostRecentAssistantMessage) {
      console.warn("can\'t cancel, no recent assistant message found");
      return;
    }
    if (mostRecentAssistantMessage.status === "IN_PROGRESS") {
      sendClientEvent(
        { type: "response.cancel" },
        "(cancel due to user interruption)"
      );
    }
    if (isOutputAudioBufferActive) {
      sendClientEvent(
        { type: "output_audio_buffer.clear" },
        "(cancel due to user interruption)"
      );
    }
  }, [transcriptItems, sendClientEvent, isOutputAudioBufferActive]);

  const handleSendTextMessage = useCallback(() => {
    if (!userText.trim()) return;
    cancelAssistantSpeech();
    const messageId = uuidv4().slice(0,32);
    addTranscriptMessage(messageId, "user", userText.trim(), false);
    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id: messageId,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userText.trim() }],
        },
      },
      "(send user text message)"
    );
    setUserText("");
    sendClientEvent({ type: "response.create" }, "(trigger response)");
  }, [userText, cancelAssistantSpeech, sendClientEvent, addTranscriptMessage]);

  const handleTalkButtonDown = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || dataChannel?.readyState !== "open") return;
    cancelAssistantSpeech();
    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: "input_audio_buffer.clear" }, "clear PTT buffer");
  }, [sessionStatus, dataChannel, cancelAssistantSpeech, sendClientEvent]);

  const handleTalkButtonUp = useCallback(() => {
    if (
      sessionStatus !== "CONNECTED" ||
      dataChannel?.readyState !== "open" ||
      !isPTTUserSpeaking
    ) return;
    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: "input_audio_buffer.commit" }, "commit PTT");
    sendClientEvent({ type: "response.create" }, "trigger response PTT");
  }, [sessionStatus, dataChannel, isPTTUserSpeaking, sendClientEvent]);

  const onToggleConnection = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setManualDisconnect(true);
    } else {
      setManualDisconnect(false); // Reset manual disconnect flag before attempting to connect
      if (selectedAgentName) {
        playIntroductoryMessageThenConnect();
      } else {
        addTranscriptBreadcrumb("Please select an agent before connecting.");
        console.warn("Connect attempt without selected agent.");
      }
    }
  }, [sessionStatus, disconnectFromRealtime, connectToRealtime, selectedAgentName, addTranscriptBreadcrumb, playIntroductoryMessageThenConnect]);

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    if (newAgentName === selectedAgentName && sessionStatus === "CONNECTED") {
      addTranscriptBreadcrumb(`Already connected to ${newAgentName}.`);
      return;
    }

    const isDisconnectedOrError = (sessionStatus as SessionStatus) === "DISCONNECTED" || (sessionStatus as SessionStatus) === "ERROR";

    if (newAgentName === selectedAgentName && isDisconnectedOrError) {
       // If same agent but disconnected, try to reconnect to this agent
      setManualDisconnect(false);
      playIntroductoryMessageThenConnect();
      return;
    }

    setManualDisconnect(false); // Allow auto-reconnect for the new agent
    
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      addTranscriptBreadcrumb(`Switching agent. Disconnecting from ${selectedAgentName || 'current session'}...`);
      disconnectFromRealtime();
      // Defer setting agent name until disconnect completes to ensure clean transition
      // The useEffect for sessionStatus === "DISCONNECTED" will pick up the new agent
      // To ensure the connection uses the new agent, we set it after a brief delay
      // or rely on the natural flow of state updates and useEffects.
      // Setting it immediately is usually fine as connectToRealtime is async and will read the latest state.
       setSelectedAgentName(newAgentName);
    } else {
      // If already disconnected, just set the agent and the connection useEffect will handle it
      setSelectedAgentName(newAgentName);
    }
  }, [selectedAgentName, sessionStatus, disconnectFromRealtime, connectToRealtime, addTranscriptBreadcrumb]);

  // useEffect for localStorage (optional, can be added if needed for this page)
  // For simplicity, not adding them initially.
  // Can copy from App.tsx if persistence for PTT, logsExpanded, audioPlaybackEnabled is desired.

   useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        audioElementRef.current.pause();
      }
    }
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && audioElementRef.current?.srcObject) {
      const remoteStream = audioElementRef.current.srcObject as MediaStream;
      startRecording(remoteStream);
    }
    return () => {
      stopRecording();
    };
  }, [sessionStatus, startRecording, stopRecording]);

  const currentAgentDetails = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
  const patientAgent = selectedAgentConfigSet?.find(a => a.name === "mrKato");
  const preceptorAgent = selectedAgentConfigSet?.find(a => a.name === "preceptor");

  const isDisconnectedOrErrorState = (sessionStatus as SessionStatus) === "DISCONNECTED" || (sessionStatus as SessionStatus) === "ERROR";

  // Determine active speaker for UI indicator
  useEffect(() => {
    const patientAgentName = selectedAgentConfigSet?.find(a => a.name === "mrKato")?.name;
    const preceptorAgentName = selectedAgentConfigSet?.find(a => a.name === "preceptor")?.name;

    let newTurn: 'user' | 'patient' | 'preceptor' | 'none' = 'none';

    if (isIntroAudioPlaying) {
      // Assuming the intro audio is spoken by the preceptor, as it's the initial agent.
      // If other agents could play intros first, this logic might need to be more dynamic.
      newTurn = "preceptor";
    } else if (isOutputAudioBufferActive) { // Agent is actively speaking via WebRTC
      if (selectedAgentName === patientAgentName) {
        newTurn = "patient";
      } else if (selectedAgentName === preceptorAgentName) {
        newTurn = "preceptor";
      } else {
        newTurn = "none"; 
      }
    } else { // Agent is NOT speaking via WebRTC, so it's implicitly user's turn or waiting for user
      newTurn = "user";
    }
    
    setActiveSpeakerTurn(newTurn);

    prevIsOutputAudioBufferActiveRef.current = isOutputAudioBufferActive;

  }, [isIntroAudioPlaying, isPTTActive, isPTTUserSpeaking, isOutputAudioBufferActive, selectedAgentName, selectedAgentConfigSet]); // Added isIntroAudioPlaying

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      {/* Header: Title, current agent name/status */}
      <div className="p-4 text-lg font-semibold flex justify-between items-center border-b bg-white shadow-sm">
        <div
          className="flex items-center"
        >
          <Image
            src="/logos/UBC-crest-blue.png"
            alt="UBC Logo"
            width={48}
            height={48}
            className="mr-3"
          /><span className="text-gray-500 font-medium text-lg mr-2 ml-2 h-full border-l border-gray-300">&nbsp;</span>
          <span className="font-bold text-xl">
            Medical History: Mr. Kato <span className="text-gray-500 font-medium text-lg">Case</span>
          </span>
        </div>
        <div className="text-sm text-gray-700">
          {currentAgentDetails ? (
            <>
              <span className="font-medium">{currentAgentDetails.publicDescription}</span>
              {sessionStatus === "CONNECTED" && <span className="ml-2 text-green-600">(Connected)</span>}
              {sessionStatus === "CONNECTING" && <span className="ml-2 text-yellow-600">(Connecting...)</span>}
              {isDisconnectedOrErrorState && !manualDisconnect && selectedAgentName && <span className="ml-2 text-gray-500">(Disconnected)</span>}
              {manualDisconnect && <span className="ml-2 text-red-600">(Manually Disconnected)</span>}
            </>
          ) : (
            "No agent selected"
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {/* Audio Interaction Modal */}
        {showAudioInteractionModal && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Audio Interaction</h3>
              <p className="mb-6 text-gray-600">
                This application works best as an audio-based conversation. Please ensure your
                microphone and speakers (or headphones) are enabled.
              </p>
              <button
                onClick={handleModalOkAndRetryAudio}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition-colors"
              >
                Let's Get Started!
              </button>
            </div>
          </div>
        )}

        {uiMode === 'avatar' && (
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-3xl relative h-full">
            
            {/* Central Active Conversation Area */}
            <div className="flex justify-around w-full items-start mt-8">
              {/* User Avatar */}
              <div className="flex flex-col items-center text-center w-1/3">
                <div className={`relative w-32 h-32 border-4 border-blue-500 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-3xl font-semibold shadow-lg`}>
                  <span style={{ position: 'relative', zIndex: 1 }}>You</span>
                  {isPTTUserSpeaking && (
                    <>
                      <div className="radiating-ring"></div>
                      <div className="radiating-ring"></div>
                      <div className="radiating-ring"></div>
                    </>
                  )}
                </div>
                <span className="mt-2 text-md font-medium text-gray-700">Your Microphone</span>
                <div className={`
                  indicator-line
                  ${activeSpeakerTurn === 'user' ? 'turn-active user-turn' : ''}
                `}></div>
              </div>

              {/* Active Agent Avatar (Patient OR Preceptor) */}
              {selectedAgentName === patientAgent?.name && patientAgent && (
                <div className="flex flex-col items-center text-center w-1/3">
                  <div 
                    className={`w-32 h-32 border-4 border-green-500 bg-green-100 rounded-full flex items-center justify-center text-green-700 text-3xl font-semibold shadow-lg cursor-default`}
                    title={`${patientAgent.publicDescription} (Active)`}
                  >
                    Patient
                  </div>
                  <span className="mt-2 text-md font-medium text-gray-700">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
                  {sessionStatus === "CONNECTED" && <span className="text-sm text-green-600 font-semibold">(Active)</span>}
                  <div className={`
                    indicator-line
                    ${activeSpeakerTurn === 'patient' ? 'turn-active patient-turn' : ''}
                  `}></div>
                </div>
              )}
              {selectedAgentName === preceptorAgent?.name && preceptorAgent && (
                <div className="flex flex-col items-center text-center w-1/3">
                  <div 
                    className={`w-32 h-32 border-4 border-purple-500 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 text-3xl font-semibold shadow-lg cursor-default`}
                    title={`${preceptorAgent.publicDescription} (Active)`}
                  >
                    Preceptor
                  </div>
                  <span className="mt-2 text-md font-medium text-gray-700">Preceptor</span>
                   {sessionStatus === "CONNECTED" && <span className="text-sm text-purple-600 font-semibold">(Active)</span>}
                  <div className={`
                    indicator-line
                    ${activeSpeakerTurn === 'preceptor' ? 'turn-active preceptor-turn' : ''}
                  `}></div>
                </div>
              )}
            </div>

            {/* PTT Button (centralized below active conversation) */}
            <div className="mt-12">
              {isPTTActive ? (
                <button
                  onMouseDown={handleTalkButtonDown}
                  onMouseUp={handleTalkButtonUp}
                  onTouchStart={handleTalkButtonDown}
                  onTouchEnd={handleTalkButtonUp}
                  className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg
                              ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}
                              focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-75
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  {isPTTUserSpeaking ? "Listening..." : "Push to Talk"}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (sessionStatus === "CONNECTED") {
                      setIsPTTActive(true); // Switch to PTT mode
                    }
                  }}
                  className={`px-8 py-4 rounded-lg text-gray-700 font-semibold transition-colors shadow-md
                              border border-gray-400 hover:bg-gray-100 
                              focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-opacity-75
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  Switch to Push-to-Talk
                </button>
              )}
            </div>

            {/* "Write" button - Remains fairly central or below PTT */}
            {/* 
            <button
              onClick={() => setUiMode('text')}
              className="mt-10 px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
            >
              Switch to Text Input
            </button>
            */}

            {/* Bottom Left Inactive Agent Toggle Area */}
            <div className="absolute bottom-6 left-6 flex flex-col space-y-4">
              {/* Inactive Patient Avatar Toggle */}
              {selectedAgentName !== patientAgent?.name && patientAgent && (
                <div
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out hover:bg-green-100 shadow-md hover:shadow-lg`}
                  onClick={() => handleAvatarAgentSelect(patientAgent.name)}
                  title={`Switch to ${patientAgent.publicDescription}`}
                >
                  <div className={`w-20 h-20 border-2 border-green-400 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-xl font-semibold`}>
                    Patient
                  </div>
                  <span className="mt-1 text-xs font-medium text-gray-600">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
                </div>
              )}

              {/* Inactive Preceptor Avatar Toggle */}
              {selectedAgentName !== preceptorAgent?.name && preceptorAgent && (
                <div
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out hover:bg-purple-100 shadow-md hover:shadow-lg`}
                  onClick={() => handleAvatarAgentSelect(preceptorAgent.name)}
                  title={`Switch to ${preceptorAgent.publicDescription}`}
                >
                  <div className={`w-20 h-20 border-2 border-purple-400 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 text-xl font-semibold`}>
                    Preceptor
                  </div>
                  <span className="mt-1 text-xs font-medium text-gray-600">Preceptor</span>
                </div>
              )}
            </div>
          </div>
        )}

        {uiMode === 'text' && (
          <div className="w-full h-full flex flex-col bg-white rounded-lg shadow">
            <Transcript
              userText={userText}
              setUserText={setUserText}
              onSendMessage={handleSendTextMessage}
              downloadRecording={downloadRecording}
              canSend={sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open"}
              selectedAgentName={selectedAgentName}
              patientAgent={patientAgent || null}
              preceptorAgent={preceptorAgent || null}
              handleAvatarAgentSelect={handleAvatarAgentSelect}
            />

            {/* PTT Button for Text Mode (if PTT mode is active) */}
            {currentAudioInputMode === 'ptt' && (
              <div className="p-4 flex justify-center items-center bg-gray-50">
                <button
                  onMouseDown={handleTalkButtonDown}
                  onMouseUp={handleTalkButtonUp}
                  onTouchStart={handleTalkButtonDown} // For touch devices
                  onTouchEnd={handleTalkButtonUp}   // For touch devices
                  className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg
                              ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}
                              focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-75
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  {isPTTUserSpeaking ? "Listening..." : "Push to Talk"}
                </button>
              </div>
            )}

            <div className="p-3 flex flex-col sm:flex-row justify-between items-center border-t bg-gray-50 space-y-2 sm:space-y-0 sm:space-x-2">
              {/* Audio Input Mode Buttons */}
              <div className="flex space-x-2">
                <button 
                  onClick={() => { setCurrentAudioInputMode("conversation"); setIsPTTActive(false); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors 
                              ${currentAudioInputMode === "conversation" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  Conversation
                </button>
                <button 
                  onClick={() => { setCurrentAudioInputMode("ptt"); setIsPTTActive(true); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors 
                              ${currentAudioInputMode === "ptt" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  Push to Talk
                </button>
                <button 
                  onClick={() => { setCurrentAudioInputMode("no_mic"); setIsPTTActive(true); /* PTT true ensures turn_detection=null */ }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors 
                              ${currentAudioInputMode === "no_mic" ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  No Mic
                </button>
              </div>

              {/* Audio Playback Toggle */}
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAudioPlaybackEnabled}
                  onChange={() => setIsAudioPlaybackEnabled(!isAudioPlaybackEnabled)}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                <span className="ms-3 text-sm font-medium text-gray-800">Audio Playback</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Bottom Toolbar: Connection Toggle */}
      <div className="p-3 border-t bg-gray-50 flex justify-center items-center space-x-4">
        <button
          onClick={onToggleConnection}
          className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors
                      ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" 
                        ? "bg-red-500 hover:bg-red-600 focus:ring-red-300" 
                        : "bg-green-500 hover:bg-green-600 focus:ring-green-300"}
                      focus:outline-none focus:ring-2 focus:ring-opacity-75`}
          disabled={!selectedAgentName && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")}
        >
          {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING"
            ? "Disconnect"
            : "Connect"}
        </button>
        {uiMode === 'avatar' && (
            <button
              onClick={() => {
                setUiMode('text');
                setCurrentAudioInputMode("ptt");
                setIsPTTActive(true);
              }}
              className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
            >
              Write
            </button>
        )}
        {uiMode === 'text' && (
            <button
              onClick={() => {
                setUiMode('avatar');
                setCurrentAudioInputMode("conversation");
                setIsPTTActive(false);
              }}
              className="px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
            >
              Speak
            </button>
        )}
        {/* Optional: Display session status explicitly if header is not enough */}
        {/* <span className="text-sm text-gray-600">Status: {sessionStatus}</span> */}
      </div>
    </div>
  );
}

// Main KatoPage component that wraps KatoPageContent with providers
// Renamed KatoPageWrapper to KatoPage to make it the default export as intended
export default function KatoPage() { 
  return (
    <TranscriptProvider>
      <EventProvider>
        <KatoPageContent />
      </EventProvider>
    </TranscriptProvider>
  );
}
// Removed export default KatoPageWrapper; 
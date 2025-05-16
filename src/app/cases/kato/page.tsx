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
  const [isPTTActive, setIsPTTActive] = useState<boolean>(true); // PTT enabled by default for avatar mode

  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] =
    useState<boolean>(true); // Default or localStorage

  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] =
    useState<boolean>(false);

  const { startRecording, stopRecording, downloadRecording } =
    useAudioDownload();

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
      setSessionStatus("DISCONNECTED");
      return null;
    }
    return data.client_secret.value;
  }, [logClientEvent, logServerEvent]);

  const connectToRealtime = useCallback(async () => {
    if (sessionStatus === "CONNECTING" || sessionStatus === "CONNECTED") {
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
      setSessionStatus("DISCONNECTED");
      addTranscriptBreadcrumb(`Error connecting: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [sessionStatus, fetchEphemeralKey, isAudioPlaybackEnabled, urlCodec, logClientEvent, handleServerEventRef, addTranscriptBreadcrumb]);

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
    const turnDetection = isPTTActive
      ? null
      : {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          create_response: true,
        };
    const instructions = currentAgent?.instructions || "";
    const tools = currentAgent?.tools || [];
    const voice = currentAgent?.voice || "sage";
    const sessionUpdateEvent = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice,
        input_audio_transcription: { 
          model: "whisper-1",
          language: "en",
        },
        turn_detection: turnDetection,
        tools,
      },
    };
    sendClientEvent(sessionUpdateEvent);
    if (shouldTriggerResponse) {
      sendSimulatedUserMessage("hi");
    }
  }, [sendClientEvent, selectedAgentConfigSet, selectedAgentName, isPTTActive, sendSimulatedUserMessage]);

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
      connectToRealtime();
    }
  }, [selectedAgentName, sessionStatus, manualDisconnect, connectToRealtime]);

  // Update session when connected
  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Switched to Agent: ${currentAgent?.publicDescription || selectedAgentName}`, currentAgent);
      updateSession(true); // Send initial message
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus, updateSession, addTranscriptBreadcrumb]);

  // Manage isPTTActive based on uiMode
  useEffect(() => {
    const newIsPTTActive = uiMode === 'avatar';
    if (newIsPTTActive !== isPTTActive) {
      setIsPTTActive(newIsPTTActive);
    }
  }, [uiMode, isPTTActive, setIsPTTActive]);

  // Update session on PTT active change (this will also run when uiMode changes isPTTActive)
  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      console.log(
        `updatingSession, isPTTActive=${isPTTActive} sessionStatus=${sessionStatus}`
      );
      updateSession();
    }
  }, [isPTTActive, sessionStatus, updateSession]);

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
    addTranscriptMessage(messageId, "user", userText.trim(), true);
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
      // Ensure an agent is selected before connecting, or connect logic handles it
      if (selectedAgentName) {
        connectToRealtime();
      } else {
        addTranscriptBreadcrumb("Please select an agent before connecting.");
        console.warn("Connect attempt without selected agent.");
      }
    }
  }, [sessionStatus, disconnectFromRealtime, connectToRealtime, selectedAgentName, addTranscriptBreadcrumb]);

  const handleAvatarAgentSelect = useCallback((newAgentName: string) => {
    if (newAgentName === selectedAgentName && sessionStatus === "CONNECTED") {
      addTranscriptBreadcrumb(`Already connected to ${newAgentName}.`);
      return;
    }

    const isDisconnectedOrError = (sessionStatus as SessionStatus) === "DISCONNECTED" || (sessionStatus as SessionStatus) === "ERROR";

    if (newAgentName === selectedAgentName && isDisconnectedOrError) {
       // If same agent but disconnected, try to reconnect to this agent
      setManualDisconnect(false);
      connectToRealtime();
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

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      {/* Header: Title, current agent name/status */}
      <div className="p-4 text-lg font-semibold flex justify-between items-center border-b bg-white shadow-sm">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <Image
            src="/openai-logomark.svg"
            alt="OpenAI Logo"
            width={24}
            height={24}
            className="mr-3"
          />
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
        {uiMode === 'avatar' && (
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-2xl">
            {/* Avatars Row */}
            <div className="flex justify-around w-full">
              {/* User Avatar */}
              <div className="flex flex-col items-center text-center">
                <div className={`w-28 h-28 border-4 border-blue-500 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-2xl font-semibold shadow-md`}>
                  You
                </div>
                <span className="mt-2 text-sm font-medium text-gray-700">Your Microphone</span>
              </div>

              {/* Patient Avatar */}
              {patientAgent && (
                <div
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out
                              ${selectedAgentName === patientAgent.name ? 'bg-green-200 shadow-lg scale-105' : 'hover:bg-green-50'}`}
                  onClick={() => handleAvatarAgentSelect(patientAgent.name)}
                  title={`Switch to ${patientAgent.publicDescription}`}
                >
                  <div className={`w-28 h-28 border-4 border-green-500 bg-green-100 rounded-full flex items-center justify-center text-green-700 text-2xl font-semibold shadow-md`}>
                    Patient
                  </div>
                  <span className="mt-2 text-sm font-medium text-gray-700">{patientAgent.name === "mrKato" ? "Mr. Kato" : patientAgent.name}</span>
                   {selectedAgentName === patientAgent.name && sessionStatus === "CONNECTED" && <span className="text-xs text-green-600">(Active)</span>}
                </div>
              )}

              {/* Preceptor Avatar */}
              {preceptorAgent && (
                <div
                  className={`flex flex-col items-center text-center cursor-pointer p-3 rounded-xl transition-all duration-150 ease-in-out
                              ${selectedAgentName === preceptorAgent.name ? 'bg-purple-200 shadow-lg scale-105' : 'hover:bg-purple-50'}`}
                  onClick={() => handleAvatarAgentSelect(preceptorAgent.name)}
                  title={`Switch to ${preceptorAgent.publicDescription}`}
                >
                  <div className={`w-28 h-28 border-4 border-purple-500 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 text-2xl font-semibold shadow-md`}>
                    Preceptor
                  </div>
                  <span className="mt-2 text-sm font-medium text-gray-700">Preceptor</span>
                  {selectedAgentName === preceptorAgent.name && sessionStatus === "CONNECTED" && <span className="text-xs text-purple-600">(Active)</span>}
                </div>
              )}
            </div>

            {/* PTT Button (centralized) */}
            {sessionStatus === "CONNECTED" && selectedAgentName && (
              <div className="mt-10">
                <button
                  onMouseDown={handleTalkButtonDown}
                  onMouseUp={handleTalkButtonUp}
                  onTouchStart={handleTalkButtonDown}
                  onTouchEnd={handleTalkButtonUp}
                  className={`px-10 py-5 rounded-full text-white text-xl font-semibold transition-colors shadow-lg
                              ${isPTTUserSpeaking ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}
                              focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-75`}
                  disabled={sessionStatus !== "CONNECTED"}
                >
                  {isPTTUserSpeaking ? "Listening..." : "Push to Talk"}
                </button>
              </div>
            )}
            {sessionStatus !== "CONNECTED" && selectedAgentName && !manualDisconnect && (
                 <div className="mt-10 text-gray-600">
                    <p>Click "Connect" below to start talking to {currentAgentDetails?.name || 'the agent'}.</p>
                 </div>
            )}

            {/* "Write" button */}
            <button
              onClick={() => setUiMode('text')}
              className="mt-10 px-8 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
            >
              Switch to Text Input
            </button>
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
            />
            <div className="p-3 flex justify-between items-center border-t bg-gray-50">
              <button
                onClick={() => setUiMode('avatar')}
                className="px-6 py-2 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
              >
                Back to Voice Mode
              </button>
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
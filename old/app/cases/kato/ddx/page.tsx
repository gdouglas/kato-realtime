"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";

// Types
import { AgentConfig, SessionStatus, TranscriptItem } from "@/app/types";

// Context providers & hooks
import { TranscriptProvider, useTranscript } from "@/app/contexts/TranscriptContext";
import { EventProvider, useEvent } from "@/app/contexts/EventContext";
import { useHandleServerEvent } from "@/app/hooks/useHandleServerEvent";

// Utilities
import { createRealtimeConnection } from "@/app/lib/realtimeConnection";

// Agent configurations
import allAgents from "@/app/agentConfigs/medicalHistoryTaking";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const DDX_AGENT_NAME = "preceptor-ddx";

interface DiagnosisItem {
  name: string;
  justification: string;
}

interface ClinicalNoteSection {
  diagnoses: DiagnosisItem[];
}

interface PrimaryDiagnosis {
  name: string; // Assuming one primary diagnosis for simplicity, or could be DiagnosisItem[]
  justification: string;
}

interface ClinicalNotes {
  cantMiss: ClinicalNoteSection;
  otherPossible: ClinicalNoteSection;
  primary: PrimaryDiagnosis; 
}

const initialClinicalNotes: ClinicalNotes = {
  cantMiss: { diagnoses: [] },
  otherPossible: { diagnoses: [] },
  primary: { name: "", justification: "" },
};

function DdxPageContent() {
  const router = useRouter();
  const urlCodec = "opus";
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb, clearTranscriptItems } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [currentAgentConfig, setCurrentAgentConfig] = useState<AgentConfig | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const [manualDisconnect, setManualDisconnect] = useState<boolean>(false);
  const [userText, setUserText] = useState<string>("");
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(true);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState<boolean>(false);
  const [isIntroAudioPlaying, setIsIntroAudioPlaying] = useState<boolean>(false);
  const introAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const [showAudioInteractionModal, setShowAudioInteractionModal] = useState<boolean>(false);
  const [audioUrlForModalRetry, setAudioUrlForModalRetry] = useState<string | null>(null);
  const [audioBlobForModalRetry, setAudioBlobForModalRetry] = useState<Blob | null>(null);
  const playedIntroRef = useRef(false);
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNotes>(initialClinicalNotes);

  // useEffect to parse transcript items and update clinicalNotes
  useEffect(() => {
    const lastMessage = transcriptItems[transcriptItems.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.title) {
      const text = lastMessage.title;
      let updatedNotes = { ...clinicalNotes };
      let notesChanged = false;

      // Attempt to parse Can't Miss Diagnoses
      // Example: "So, for Can't Miss Diagnoses, we have [Diagnosis Name] because [Justification]."
      const cantMissRegex = /Can't Miss Diagnoses, we have (.*?) because (.*?)\./i;
      let match = text.match(cantMissRegex);
      if (match && match[1] && match[2]) {
        const newDx: DiagnosisItem = { name: match[1].trim(), justification: match[2].trim() };
        // Avoid duplicates, simple check by name
        if (!updatedNotes.cantMiss.diagnoses.some(dx => dx.name === newDx.name)) {
          updatedNotes.cantMiss = { diagnoses: [...updatedNotes.cantMiss.diagnoses, newDx] };
          notesChanged = true;
        }
      }

      // Attempt to parse Other Possible Diagnoses
      // Example: "Under Other Possible Diagnoses, you mentioned [Diagnosis Name], with the reasoning being [Justification]."
      const otherPossibleRegex = /Other Possible Diagnoses, you mentioned (.*?), with the reasoning being (.*?)\./i;
      match = text.match(otherPossibleRegex);
      if (match && match[1] && match[2]) {
        const newDx: DiagnosisItem = { name: match[1].trim(), justification: match[2].trim() };
        if (!updatedNotes.otherPossible.diagnoses.some(dx => dx.name === newDx.name)) {
          updatedNotes.otherPossible = { diagnoses: [...updatedNotes.otherPossible.diagnoses, newDx] };
          notesChanged = true;
        }
      }

      // Attempt to parse Primary Diagnosis
      // Example: "Okay, Primary Diagnosis: [Diagnosis Name], justified by [Justification]."
      const primaryRegex = /Primary Diagnosis: (.*?), justified by (.*?)\./i;
      match = text.match(primaryRegex);
      if (match && match[1] && match[2]) {
        if (updatedNotes.primary.name !== match[1].trim() || updatedNotes.primary.justification !== match[2].trim()) {
          updatedNotes.primary = { name: match[1].trim(), justification: match[2].trim() };
          notesChanged = true;
        }
      }

      if (notesChanged) {
        setClinicalNotes(updatedNotes);
      }
    }
  }, [transcriptItems, clinicalNotes]); // clinicalNotes is a dependency to avoid stale closures if we build upon it incrementally

  // No-op function for downloadRecording as it's not used on this page
  const noOpDownload = useCallback(() => {
    console.log("Download recording not implemented on DDx page.");
  }, []);

  const sendClientEvent = useCallback((eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      logClientEvent(eventObj, eventNameSuffix);
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      logClientEvent({ attemptedEvent: eventObj.type }, "error.data_channel_not_open");
      addTranscriptMessage(uuidv4().slice(0,32), "assistant", "Error: Data channel not open.", false);
    }
  }, [logClientEvent, addTranscriptMessage]);

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName: DDX_AGENT_NAME,
    selectedAgentConfigSet: allAgents as AgentConfig[],
    sendClientEvent,
    setSelectedAgentName: () => {},
    setIsOutputAudioBufferActive,
  });

  const fetchEphemeralKey = useCallback(async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch(`${API_BASE_URL}/api/v1/session`, { method: "POST" });
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
      console.warn(`Connect attempt while status is ${sessionStatus}. Aborting.`);
      return;
    }
    setManualDisconnect(false);
    setSessionStatus("CONNECTING");
    addTranscriptBreadcrumb(`Connecting to ${currentAgentConfig?.publicDescription || DDX_AGENT_NAME}...`);

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) return;

      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
      }
      audioElementRef.current.autoplay = isAudioPlaybackEnabled;

      const { pc, dc } = await createRealtimeConnection(EPHEMERAL_KEY, audioElementRef, urlCodec);
      pcRef.current = pc;
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        logClientEvent({}, "data_channel.open");
        addTranscriptBreadcrumb("Data channel open.");
      });
      dc.addEventListener("close", () => {
        logClientEvent({}, "data_channel.close");
        addTranscriptBreadcrumb("Data channel closed.");
      });
      dc.addEventListener("error", (eventError: any) => logClientEvent({ error: eventError }, "data_channel.error"));
      dc.addEventListener("message", (e: MessageEvent) => handleServerEventRef.current(JSON.parse(e.data)));
      setDataChannel(dc);
    } catch (connectionError) {
      console.error("Error connecting to realtime:", connectionError);
      setSessionStatus("ERROR");
      addTranscriptBreadcrumb(`Error connecting: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`);
    }
  }, [sessionStatus, fetchEphemeralKey, isAudioPlaybackEnabled, urlCodec, logClientEvent, handleServerEventRef, addTranscriptBreadcrumb, currentAgentConfig]);

  const disconnectFromRealtime = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(sender => sender.track?.stop());
      pcRef.current.close();
      pcRef.current = null;
    }
    setDataChannel(null);
    setSessionStatus("DISCONNECTED");
    logClientEvent({}, "disconnected");
    addTranscriptBreadcrumb("Disconnected.");
  }, [logClientEvent, addTranscriptBreadcrumb]);

  const updateSession = useCallback((shouldTriggerResponse: boolean = false) => {
    if (!currentAgentConfig) return;
    sendClientEvent({ type: "input_audio_buffer.clear" }, "clear_audio_buffer_on_session_update");
    
    const sessionUpdateEvent = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: currentAgentConfig.instructions,
        voice: currentAgentConfig.voice || "shimmer",
        input_audio_transcription: { model: "whisper-1", language: "en" },
        turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
            create_response: true,
        },
        tools: currentAgentConfig.tools,
      },
    };
    sendClientEvent(sessionUpdateEvent);
    if (shouldTriggerResponse) {
      // Optional: send an initial message
    }
  }, [sendClientEvent, currentAgentConfig]);

  const playIntroductoryMessageThenConnect = useCallback(async (isRetryAfterModal = false) => {
    if (!isRetryAfterModal && (sessionStatus === "CONNECTING" || sessionStatus === "CONNECTED" || !currentAgentConfig)) {
      console.warn("Play intro called in invalid state or no agent config.");
      return;
    }
    if (playedIntroRef.current && !isRetryAfterModal) {
        addTranscriptBreadcrumb(`Reconnecting to ${currentAgentConfig?.publicDescription || DDX_AGENT_NAME} without replaying intro.`);
        setIsIntroAudioPlaying(false);
        connectToRealtime();
        return;
    }

    setIsIntroAudioPlaying(true);
    addTranscriptBreadcrumb(isRetryAfterModal ? "Retrying introductory message..." : "Preparing introductory message...");

    const playAudioAndSetupHandlers = (audioSrcUrl: string, audioBlobToRevoke?: Blob) => {
      if (!introAudioElementRef.current) introAudioElementRef.current = new Audio();
      const audio = introAudioElementRef.current;
      const objectUrlToRevokeIfCreated = audioBlobToRevoke ? audioSrcUrl : null;

      audio.src = audioSrcUrl;
      audio.play()
        .then(() => {
          addTranscriptBreadcrumb("Introductory message playing.");
          playedIntroRef.current = true;
          setShowAudioInteractionModal(false);
        })
        .catch(error => {
          setIsIntroAudioPlaying(false);
          if (error.name === "NotAllowedError" && !isRetryAfterModal) {
            addTranscriptBreadcrumb("Audio playback requires user interaction.");
            setAudioUrlForModalRetry(audioSrcUrl);
            setAudioBlobForModalRetry(audioBlobToRevoke || null);
            setShowAudioInteractionModal(true);
          } else {
            addTranscriptBreadcrumb(`Error playing intro: ${error.message}. Connecting directly.`);
            playedIntroRef.current = true;
            if (objectUrlToRevokeIfCreated) URL.revokeObjectURL(objectUrlToRevokeIfCreated);
            if (audioBlobForModalRetry && audioBlobToRevoke !== audioBlobForModalRetry) setAudioBlobForModalRetry(null);
            if (audioUrlForModalRetry === audioSrcUrl) setAudioUrlForModalRetry(null);
            connectToRealtime();
          }
        });

      audio.onended = () => {
        setIsIntroAudioPlaying(false);
        addTranscriptBreadcrumb("Introductory message finished. Connecting...");
        if (objectUrlToRevokeIfCreated) URL.revokeObjectURL(objectUrlToRevokeIfCreated);
        if (audioBlobForModalRetry && audioBlobToRevoke !== audioBlobForModalRetry) setAudioBlobForModalRetry(null);
        if (audioUrlForModalRetry === audioSrcUrl) setAudioUrlForModalRetry(null);
        connectToRealtime();
      };
      audio.onerror = (eventError) => {
        setIsIntroAudioPlaying(false);
        console.error("Error during intro audio playback (onerror):", eventError);
        addTranscriptBreadcrumb("Error during intro playback. Connecting directly.");
        if (objectUrlToRevokeIfCreated) URL.revokeObjectURL(objectUrlToRevokeIfCreated);
        if (audioBlobForModalRetry && audioBlobToRevoke !== audioBlobForModalRetry) setAudioBlobForModalRetry(null);
        if (audioUrlForModalRetry === audioSrcUrl) setAudioUrlForModalRetry(null);
        connectToRealtime();
      };
    };

    if (isRetryAfterModal && audioUrlForModalRetry) {
        playAudioAndSetupHandlers(audioUrlForModalRetry, audioBlobForModalRetry || undefined);
    } else if (!isRetryAfterModal && currentAgentConfig?.introAudio?.text) {
        try {
            addTranscriptBreadcrumb("Fetching introductory audio...");
            const response = await fetch(`${API_BASE_URL}/api/v1/audio/speech`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: currentAgentConfig.introAudio.text,
                    model: currentAgentConfig.introAudio.model || "gpt-4o-mini-tts",
                    voice: currentAgentConfig.introAudio.voice || "shimmer",
                    instructions: currentAgentConfig.introAudio.instructions,
                }),
            });
            if (!response.ok) throw new Error(`Failed to fetch introductory audio: ${response.status} ${await response.text()}`);
            const newAudioBlob = await response.blob();
            const newAudioUrl = URL.createObjectURL(newAudioBlob);
            playAudioAndSetupHandlers(newAudioUrl, newAudioBlob);
        } catch (fetchError: any) {
            setIsIntroAudioPlaying(false);
            playedIntroRef.current = true;
            console.error("Error fetching introductory message:", fetchError);
            addTranscriptBreadcrumb(`Error fetching intro: ${fetchError.message}. Connecting directly.`);
            connectToRealtime();
        }
    } else {
        setIsIntroAudioPlaying(false);
        playedIntroRef.current = true;
        addTranscriptBreadcrumb(currentAgentConfig?.introAudio?.text ? "Issue with intro audio retry. Connecting directly." : "No introductory message. Connecting...");
        connectToRealtime();
    }
  }, [sessionStatus, currentAgentConfig, connectToRealtime, addTranscriptBreadcrumb, audioUrlForModalRetry, audioBlobForModalRetry, API_BASE_URL]);

  const handleModalOkAndRetryAudio = () => {
    setShowAudioInteractionModal(false);
    if (audioUrlForModalRetry) {
      playIntroductoryMessageThenConnect(true);
    } else {
      addTranscriptBreadcrumb("No audio to retry. Connecting directly.");
      connectToRealtime();
    }
  };

  useEffect(() => {
    const agent = (allAgents as AgentConfig[]).find(a => a.name === DDX_AGENT_NAME);
    if (agent) {
      setCurrentAgentConfig(agent);
      addTranscriptBreadcrumb(`Differential Diagnosis session with: ${agent.publicDescription}`);
    } else {
      addTranscriptBreadcrumb(`Error: Agent configuration for '${DDX_AGENT_NAME}' not found.`);
      setSessionStatus("ERROR");
    }
    clearTranscriptItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTranscriptBreadcrumb, clearTranscriptItems]);

  useEffect(() => {
    if (currentAgentConfig && sessionStatus === "DISCONNECTED" && !manualDisconnect) {
        if (!playedIntroRef.current && currentAgentConfig.introAudio?.text) {
            playIntroductoryMessageThenConnect();
        } else {
            connectToRealtime();
        }
    }
  }, [currentAgentConfig, sessionStatus, manualDisconnect, playIntroductoryMessageThenConnect, connectToRealtime]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && currentAgentConfig) {
      updateSession(false);
    }
  }, [currentAgentConfig, sessionStatus, updateSession]);
  
  useEffect(() => {
    return () => {
      disconnectFromRealtime();
      if (audioUrlForModalRetry && audioBlobForModalRetry) {
        URL.revokeObjectURL(audioUrlForModalRetry);
        setAudioUrlForModalRetry(null);
        setAudioBlobForModalRetry(null);
      }
    };
  }, [disconnectFromRealtime, audioUrlForModalRetry, audioBlobForModalRetry]);

  const handleSendTextMessage = useCallback(() => {
    if (!userText.trim() || !currentAgentConfig) return;
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
      "(send user text message for DDx)"
    );
    setUserText("");
    sendClientEvent({ type: "response.create" }, "(trigger DDx response)");
  }, [userText, sendClientEvent, addTranscriptMessage, currentAgentConfig]);

  const onToggleConnection = useCallback(() => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      setManualDisconnect(true);
      disconnectFromRealtime();
    } else if (currentAgentConfig) {
      setManualDisconnect(false);
      if (!playedIntroRef.current && currentAgentConfig.introAudio?.text) {
          playIntroductoryMessageThenConnect();
      } else {
          connectToRealtime();
      }
    }
  }, [sessionStatus, disconnectFromRealtime, connectToRealtime, currentAgentConfig, playIntroductoryMessageThenConnect]);

  if (!currentAgentConfig && sessionStatus !== "ERROR") {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-100 text-gray-700">
        Loading DDx session...
      </div>
    );
  }
  if (sessionStatus === "ERROR" && !currentAgentConfig) {
    return (
       <div className="flex flex-col h-screen items-center justify-center bg-gray-100 text-red-600 p-4">
        <p className="text-xl font-semibold mb-2">Error Initializing DDx Session</p>
        <p className="text-center mb-4">Could not load the agent configuration for '{DDX_AGENT_NAME}'. Please check the console and agent configurations.</p>
        <button
            onClick={() => router.push('/cases/kato')}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
            Back to Kato Case
        </button>
      </div>
    );
  }

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800">
      <div className="p-4 text-lg font-semibold flex justify-between items-center border-b bg-white shadow-sm">
        <div className="flex items-center">
           <Image src="/logos/UBC-crest-blue.png" alt="UBC Logo" width={40} height={40} className="mr-3"/>
           <span className="text-gray-500 font-medium text-lg mr-2 ml-2 h-full border-l border-gray-300">&nbsp;</span>
          <span className="font-bold text-xl">Differential Diagnosis with {currentAgentConfig?.publicDescription || DDX_AGENT_NAME}</span>
        </div>
        <div className="text-sm text-gray-700">
          {sessionStatus === "CONNECTED" && <span className="ml-2 text-green-600">(Connected)</span>}
          {sessionStatus === "CONNECTING" && <span className="ml-2 text-yellow-600">(Connecting...)</span>}
          {sessionStatus === "DISCONNECTED" && !manualDisconnect && <span className="ml-2 text-gray-500">(Disconnected)</span>}
          {sessionStatus === "ERROR" && <span className="ml-2 text-red-500">(Error)</span>}
          {manualDisconnect && <span className="ml-2 text-red-600">(Manually Disconnected)</span>}
        </div>
      </div>
      
      <div className="p-4 bg-blue-50 text-blue-700 border-b border-blue-200">
        <p className="text-center text-sm">
          You have just completed an encounter with a 75-year-old man whose chief complaint is gradual vision loss in the right eye.
        </p>
      </div>

      {showAudioInteractionModal && (
        <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Audio Interaction Required</h3>
            <p className="mb-6 text-gray-600">
              To play the introductory message, please click below. This is often required by browsers for audio to start.
            </p>
            <button
              onClick={handleModalOkAndRetryAudio}
              className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Play Audio & Continue
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-row bg-gray-100 overflow-hidden p-4 gap-4">
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
          <Transcript
            userText={userText}
            setUserText={setUserText}
            onSendMessage={handleSendTextMessage}
            canSend={sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open"}
            downloadRecording={noOpDownload}
          />
        </div>

        <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden p-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Clinical Notes</h2>
          <div className="flex-1 overflow-y-auto p-2 bg-gray-50 rounded space-y-4">
            {/* Can't Miss Diagnoses Section */}
            <div>
              <h3 className="text-md font-semibold text-gray-600 mb-1"># Can't Miss Diagnoses</h3>
              {clinicalNotes.cantMiss.diagnoses.length > 0 ? (
                clinicalNotes.cantMiss.diagnoses.map((dx, index) => (
                  <div key={`cantMiss-${index}`} className="ml-4 mb-2 p-2 border-l-2 border-red-200 bg-red-50 rounded-r-md">
                    <h4 className="font-medium text-red-700">## {dx.name || "Unnamed Diagnosis"}</h4>
                    <p className="text-xs text-red-600 mt-1"><span className="font-semibold">### Justification:</span> {dx.justification || "No justification provided."}</p>
                  </div>
                ))
              ) : (
                <p className="ml-4 text-xs text-gray-400 italic">No can't miss diagnoses noted yet.</p>
              )}
            </div>

            {/* Other Possible Diagnoses Section */}
            <div>
              <h3 className="text-md font-semibold text-gray-600 mb-1"># Other Possible Diagnoses</h3>
              {clinicalNotes.otherPossible.diagnoses.length > 0 ? (
                clinicalNotes.otherPossible.diagnoses.map((dx, index) => (
                  <div key={`otherPossible-${index}`} className="ml-4 mb-2 p-2 border-l-2 border-yellow-300 bg-yellow-50 rounded-r-md">
                    <h4 className="font-medium text-yellow-800">## {dx.name || "Unnamed Diagnosis"}</h4>
                    <p className="text-xs text-yellow-700 mt-1"><span className="font-semibold">### Justification:</span> {dx.justification || "No justification provided."}</p>
                  </div>
                ))
              ) : (
                <p className="ml-4 text-xs text-gray-400 italic">No other possible diagnoses noted yet.</p>
              )}
            </div>

            {/* Primary Diagnoses Section */}
            <div>
              <h3 className="text-md font-semibold text-gray-600 mb-1"># Primary Diagnosis</h3>
              {clinicalNotes.primary.name ? (
                <div className="ml-4 p-2 border-l-2 border-green-300 bg-green-50 rounded-r-md">
                  <h4 className="font-medium text-green-700">## {clinicalNotes.primary.name}</h4>
                  <p className="text-xs text-green-600 mt-1"><span className="font-semibold">### Justification:</span> {clinicalNotes.primary.justification || "No justification provided."}</p>
                </div>
              ) : (
                <p className="ml-4 text-xs text-gray-400 italic">Primary diagnosis not determined yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t bg-gray-50 flex justify-between items-center space-x-4">
        <button
            onClick={() => router.push('/cases/kato')}
            className="px-6 py-3 border border-gray-400 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
            Back to Kato Case
        </button>
        
        <div className="flex items-center space-x-2">
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

        <button
          onClick={onToggleConnection}
          className={`px-8 py-3 rounded-lg text-white font-semibold text-lg shadow-md transition-colors 
                      ${sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" 
                        ? "bg-red-500 hover:bg-red-600 focus:ring-red-300" 
                        : "bg-green-500 hover:bg-green-600 focus:ring-green-300"}
                      focus:outline-none focus:ring-2 focus:ring-opacity-75`}
          disabled={!currentAgentConfig && !(sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING")}
        >
          {sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING" ? "Disconnect" : "Connect"}
        </button>
      </div>
    </div>
  );
}

export default function DdxPage() { 
  return (
    <TranscriptProvider>
      <EventProvider>
        <DdxPageContent />
      </EventProvider>
    </TranscriptProvider>
  );
} 
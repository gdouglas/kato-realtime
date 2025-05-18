"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "@/app/components/Transcript";
import Events from "@/app/components/Events";
import BottomToolbar from "@/app/components/BottomToolbar";

// Types
import { AgentConfig } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useHandleServerEvent } from "./hooks/useHandleServerEvent";
import { AgentLifecycleProvider, useAgentLifecycle } from "@/app/contexts/AgentLifecycleContext";
import { useEventBus } from "./contexts/EventBusContext";

// Utilities
import { createRealtimeConnection } from "./lib/realtimeConnection";
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import medicalHistoryTakingAgents from "@/app/agentConfigs/medicalHistoryTaking";

// Define the base URL for your FastAPI backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

import useAudioDownload from "./hooks/useAudioDownload";

// Placeholder imports for UI components - adjust paths if necessary
// import ChatMessage from "@/app/components/ChatMessage"; // Commented out: Component not found
// import MicDeniedModal from "@/app/components/MicDeniedModal"; // Commented out: Component not found
// import AgentProfile from "@/app/components/AgentProfile"; // Commented out: Component not found
// import UserResponseSuggestion from "@/app/components/UserResponseSuggestion"; // Commented out: Component not found
// import ChatInput from "@/app/components/ChatInput"; // Commented out: Component not found
// import CallControls from "@/app/components/CallControls"; // Commented out: Component not found
// import Debugger from "@/app/components/Debugger"; // Commented out: Component not found

function AppContents() {
  const searchParams = useSearchParams();
  const agentLifecycle = useAgentLifecycle();
  const eventBus = useEventBus();

  // Derive state from XState machine
  const xstateSessionStatus = agentLifecycle.state.context.sessionStatus;
  const xstateSelectedAgentName = agentLifecycle.state.context.selectedAgentName;
  const xstateCurrentAgentConfig = agentLifecycle.state.context.currentAgentConfig;
  const xstateError = agentLifecycle.state.context.error;
  const xstateDc = agentLifecycle.state.context.dc; // Get DataChannel from XState context
  const xstatePc = agentLifecycle.state.context.pc; // Get PeerConnection from XState context

  // Use urlCodec directly from URL search params (default: "opus")
  const urlCodec = searchParams.get("codec") || "opus";
  const initialAgentName = searchParams.get("agent") || undefined; // Can be undefined

  const {
    transcriptItems,
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    updateTranscriptMessage,
    clearTranscriptItems,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  // const [selectedAgentName, setSelectedAgentName] = useState<string>(""); // Replaced by XState
  // const [currentAgentConfig, setCurrentAgentConfig] = useState<AgentConfig | null>(null); // Replaced by XState
  // const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED"); // Replaced by XState
  
  // Still needed for UI elements that select an agent config set (e.g. dropdown)
  const [selectedAgentConfigSetKey, setSelectedAgentConfigSetKey] =
    useState<string>(defaultAgentSetKey);
  const selectedAgentConfigSet = allAgentSets[selectedAgentConfigSetKey];

  // This state might need to be reconciled with XState or moved if it directly relates to agent state
  const [userResponseSuggestions, setUserResponseSuggestions] = useState<string[]>([]);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState(false);
  const [showMicDeniedModal, setShowMicDeniedModal] = useState(false);
  const [micAccessError, setMicAccessError] = useState(false);
  const [audioInputMode, setAudioInputMode] = useState<string>("push_to_talk"); // push_to_talk, continuous, no_mic
  const [currentUserInput, setCurrentUserInput] = useState<string>(""); // State for Transcript input

  const handleServerEventRef = useHandleServerEvent({
    selectedAgentName: xstateSelectedAgentName || "",
    selectedAgentConfigSet: selectedAgentConfigSet,
    logClientEvent,
    sendToMachine: agentLifecycle.send,
    setIsOutputAudioBufferActive,
  });

  // Access .current for functions from the ref
  const handleServerEvent = handleServerEventRef.current;

  // Assuming isFunctionCallInProgress and setIsFunctionCallInProgress are managed by App state or another hook for now
  // If they were part of useHandleServerEvent's return object (not the ref itself), the original destructuring would be fine.
  // For now, let's define them in App.tsx state as placeholders if they are not directly from the ref.
  const [isFunctionCallInProgress, setIsFunctionCallInProgress] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const newSessionId = uuidv4().slice(0, 32);
    setSessionId(newSessionId);
    // addTranscriptBreadcrumb(`Session ID: ${newSessionId}`); // generateSessionId was commented out
  }, []);

  // Initialize agent from URL or default on mount
  useEffect(() => {
    const agentToSelect = initialAgentName || selectedAgentConfigSet[0]?.name;
    if (agentToSelect && !xstateSelectedAgentName && agentLifecycle.state.matches('idle')) {
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName: agentToSelect });
      addTranscriptBreadcrumb(
        `Initial agent from URL/default: ${agentToSelect}`
      );
    }
  }, [initialAgentName, selectedAgentConfigSet, agentLifecycle, xstateSelectedAgentName, addTranscriptBreadcrumb]);

  // Welcome message based on machine's current agent config
  useEffect(() => {
    if (xstateCurrentAgentConfig && agentLifecycle.state.matches('agentActive')) {
      // addTranscriptMessage(uuidv4(), "assistant", createWelcomeMessage(xstateCurrentAgentConfig.name)); // createWelcomeMessage was commented out
      addTranscriptMessage(uuidv4(), "assistant", `Welcome to ${xstateCurrentAgentConfig.name}! How can I help you today?`);
    }
  }, [xstateCurrentAgentConfig, agentLifecycle.state, addTranscriptMessage]);

  // Event Bus listeners
  useEffect(() => {
    const handleShowMicDenied = () => setShowMicDeniedModal(true);
    const handleAudioInputModeChanged = (mode: string) => setAudioInputMode(mode);

    eventBus.on(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, handleShowMicDenied);
    eventBus.on(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChanged);

    return () => {
      eventBus.off(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED, handleShowMicDenied);
      eventBus.off(KatoEvents.AUDIO_INPUT_MODE_CHANGED, handleAudioInputModeChanged);
    };
  }, [eventBus, agentLifecycle]);


  const handleAgentSelection = (agentName: string) => {
    if (agentName !== xstateSelectedAgentName) {
      addTranscriptBreadcrumb(`UI: User selected agent: ${agentName}`);
      agentLifecycle.send({ type: 'SELECT_AGENT', agentName: agentName });
      setUserResponseSuggestions([]);
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

  // Function to send messages (text) via RTC or handle function calls
  const sendMessage = async (text: string, isFunctionResult = false) => {
    if (!text.trim() && !isFunctionResult) return;

    if (!isFunctionResult) {
      const messageId = uuidv4();
      addTranscriptMessage(messageId, "user", text);
    }

    const currentDc = xstateDc;

    if (xstateCurrentAgentConfig && agentLifecycle.state.matches('agentActive') && currentDc?.readyState === "open") {
      logClientEvent({ text }, "send_message.to_rtc");
      currentDc.send(JSON.stringify({ type: "text_message", content: text }));
    } else if (xstateCurrentAgentConfig && xstateCurrentAgentConfig.toolLogic) {
      addTranscriptBreadcrumb(
        "RTC not connected or machine not active. Trying to use local tool logic for function call."
      );
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === "function_call" && parsed.function && handleServerEvent) {
          setIsFunctionCallInProgress(true);
          await handleServerEvent({ type: "function.call", item_id: uuidv4(), function: parsed.function } as any);
          setIsFunctionCallInProgress(false);
        }
      } catch (e) {
        addTranscriptBreadcrumb("Error parsing or handling local function call: " + (e as Error).message);
      }
    } else {
      addTranscriptBreadcrumb(
        "RTC not connected/active and no local tool logic. Message not sent."
      );
    }
  };

  const isSwitchingAgents = agentLifecycle.state.matches('disconnectingForSwitch') || 
                            agentLifecycle.state.matches('activatingAgent') || 
                            agentLifecycle.state.matches('preparingToSwitch');

  const callControlStatus = isSwitchingAgents ? "CONNECTING" : xstateSessionStatus;
  const connectButtonDisabled = isSwitchingAgents || 
                                agentLifecycle.state.matches('connecting') || 
                                agentLifecycle.state.matches('disconnectingManually') ||
                                agentLifecycle.state.matches('playingIntro') ||
                                agentLifecycle.state.matches('awaitingAudioModalConfirmation') ||
                                !xstateSelectedAgentName;

  // Retrieve pc from XState context for the Debugger component
  // const xstatePcRef = agentLifecycle.state.context.pc; // Already defined as xstatePc

  // The actual <audio> element needs to be in the DOM for the machine to use.
  // We pass the audioRef.current to the AgentLifecycleProvider.
  useEffect(() => {
    if (!audioRef.current) {
      // Create the audio element if it doesn't exist, though it should from the JSX
      // This is more of a safeguard, ideally it's always there via the <audio> tag.
      const audioElement = document.createElement('audio');
      audioElement.id = "kato-audio-element"; // Optional: give it an ID
      document.body.appendChild(audioElement); // Append somewhere, or ensure <audio ref={audioRef}/> is rendered
      audioRef.current = audioElement;
    }
    // The audio element is now available at audioRef.current
    // The AgentLifecycleProvider will receive this through props.
  }, []);

  // useEffect to handle RTC_SERVER_MESSAGE_RECEIVED via context change
  useEffect(() => {
    const { lastServerMessage } = agentLifecycle.state.context;
    if (lastServerMessage && handleServerEventRef.current) {
      handleServerEventRef.current(lastServerMessage);
      // No need to manually clear here, machine already did it immediately after setting
    }
    // Adding all dependencies that might cause this effect to re-run if they change.
    // lastServerMessage is the key trigger.
  }, [agentLifecycle.state.context.lastServerMessage, handleServerEventRef]);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <div>
            <Image
              src="/openai-logomark.svg"
              alt="OpenAI Logo"
              width={20}
              height={20}
              className="mr-2"
            />
          </div>
          <div>
            Realtime API <span className="text-gray-500">Agents</span>
          </div>
        </div>
        <div className="flex items-center">
          <label className="flex items-center text-base gap-1 mr-2 font-medium">
            Scenario
          </label>
          <div className="relative inline-block">
            <select
              value={selectedAgentConfigSetKey}
              onChange={(e) => {
                const newKey = e.target.value;
                setSelectedAgentConfigSetKey(newKey);
                // Automatically select the first agent of the new set if current selection is not in new set or no selection
                const newAgentSet = allAgentSets[newKey];
                if (newAgentSet && newAgentSet.length > 0) {
                  if (!xstateSelectedAgentName || !newAgentSet.find(a => a.name === xstateSelectedAgentName)) {
                     handleAgentSelection(newAgentSet[0].name); 
                  }
                }
              }}
              className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
            >
              {Object.keys(allAgentSets).map((agentKey) => (
                <option key={agentKey} value={agentKey}>
                  {agentKey}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          {selectedAgentConfigSet && (
            <div className="flex items-center ml-6">
              <label className="flex items-center text-base gap-1 mr-2 font-medium">
                Agent
              </label>
              <div className="relative inline-block agent-selector">
                <select
                  value={xstateSelectedAgentName || ""}
                  onChange={(e) => handleAgentSelection(e.target.value)}
                  disabled={isSwitchingAgents || agentLifecycle.state.matches('connecting')}
                  className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
                >
                  {selectedAgentConfigSet.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
        <Transcript
          userText={currentUserInput}
          setUserText={setCurrentUserInput}
          onSendMessage={sendMessage} 
          downloadRecording={() => {}} // Placeholder
          canSend={xstateSessionStatus === "CONNECTED" && xstateDc?.readyState === "open"} // Use xstateDc
        />

        <Events isExpanded={true} />
      </div>

      <BottomToolbar
        sessionStatus={callControlStatus}
        onToggleConnection={handleConnectDisconnect}
        isPTTActive={false}
        setIsPTTActive={(active) => {}}
        isPTTUserSpeaking={false}
        handleTalkButtonDown={() => {}}
        handleTalkButtonUp={() => {}}
        isEventsPaneExpanded={true}
        setIsEventsPaneExpanded={(expanded) => {}}
        isAudioPlaybackEnabled={true}
        setIsAudioPlaybackEnabled={(enabled) => {}}
        codec={urlCodec}
        onCodecChange={(newCodec) => {
          const url = new URL(window.location.toString());
          url.searchParams.set("codec", newCodec);
          window.location.replace(url.toString());
        }}
      />

      <audio ref={audioRef} className="hidden" id="kato-audio-element-app" />
      {/* {showMicDeniedModal && (
        <MicDeniedModal onClose={() => setShowMicDeniedModal(false)} />
      )} */}

      <div className="flex-grow overflow-y-auto p-4 space-y-2 scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch">
        {/* {transcriptItems.map((item, index) => (
          <ChatMessage
            key={item.itemId || index}
            message={item}
            agentConfig={xstateCurrentAgentConfig}
            onResend={item.role === "user" && item.type === "MESSAGE" && item.title ? () => sendMessage(item.title as string) : undefined}
            onFunctionCall={async (fc: any) => { 
              if (handleServerEvent) {
                setIsFunctionCallInProgress(true);
                await handleServerEvent({ type: "function.call", item_id: uuidv4(), function: fc } as any); 
                setIsFunctionCallInProgress(false);
              }
            }}
            isFunctionCallInProgress={isFunctionCallInProgress}
            isLastItem={index === transcriptItems.length - 1}
            updateTranscriptMessage={updateTranscriptMessage}
          />
        ))} */}
      </div>

      {/* {xstateCurrentAgentConfig && (
        <AgentProfile agentConfig={xstateCurrentAgentConfig} />
      )} */}

      {/* {userResponseSuggestions.length > 0 && (
        <div className="p-4 border-t border-gray-700">
          <h3 className="text-sm text-gray-400 mb-2">Suggested Responses:</h3>
          <div className="flex flex-wrap gap-2">
            {userResponseSuggestions.map((suggestion, index) => (
              <UserResponseSuggestion
                key={index}
                suggestion={suggestion}
                onClick={() => sendMessage(suggestion)}
              />
            ))}
          </div>
        </div>
      )} */}

      {/* <ChatInput
        onSendMessage={sendMessage}
        isAgentBusy={isFunctionCallInProgress || isOutputAudioBufferActive || isSwitchingAgents || agentLifecycle.state.matches('connecting')}
        sessionStatus={xstateSessionStatus}
        micAccessError={micAccessError}
        audioInputMode={audioInputMode}
      /> */}

      {/* <CallControls
        sessionStatus={callControlStatus}
        onConnectDisconnect={handleConnectDisconnect}
        disabled={connectButtonDisabled}
      /> */}

      {/* <Debugger
        selectedAgentName={xstateSelectedAgentName || ""}
        currentAgentConfig={xstateCurrentAgentConfig}
        sessionStatus={xstateSessionStatus}
        pc={xstatePc} // Use xstatePc from XState context
        dc={xstateDc} // Use xstateDc from XState context
        xstateSnapshot={agentLifecycle.state}
        xstateError={xstateError as any}
      /> */}
    </div>
  );
}

// The main App component now wraps AppContents with AgentLifecycleProvider
const App: React.FC = () => {
  // Props for AgentLifecycleProvider are prepared here
  // Some might come from URL, others from different contexts or fixed values
  const searchParams = useSearchParams(); // Need to use here for urlCodec if not using Suspense
  const urlCodec = searchParams ? searchParams.get("codec") || "opus" : "opus";
  
  // These would be the ideal place to get these, but useHandleServerEvent uses hooks
  // So we define a temporary minimal one here if needed for the provider, 
  // or ensure AppContents is structured so it can provide it.
  // For now, handleServerEvent will be initialized inside AppContents and passed up, which is not ideal.
  // A better pattern is for App to instantiate all dependencies for the Provider.

  // This is tricky because useHandleServerEvent itself uses useAgentLifecycle.
  // This creates a circular dependency if App tries to create handleServerEvent to pass to Provider,
  // and Provider creates the machine that useAgentLifecycle consumes.
  
  // For now, we'll rely on AgentLifecycleProvider getting its dependencies like loggers from its own context hooks.
  // `handleServerEvent` is the tricky one. It's created in AppContents which is a child of AgentLifecycleProvider.
  // This suggests that either: 
  //  1. `handleServerEvent` logic needs to be refactored to not depend on `useAgentLifecycle` OR
  //  2. The part of `handleServerEvent` that machine needs is simpler and can be passed, OR
  //  3. The machine actor calls specific functions that `AppContents` provides via a different context/prop, not the whole `handleServerEvent`.

  // Let's assume for the moment that App.tsx (or layout.tsx) is where AgentLifecycleProvider is used.
  // The `audioRef` also needs to be available to the provider.
  // This structure is becoming complex due to hook dependencies for provider input.

  // A simplified approach for this step: Assume AgentLifecycleProvider is used in a parent component (e.g., layout.tsx)
  // and it receives all necessary props there.
  // For this file, AppContents will just consume the context.

  // If this `App` component IS the one rendering `AgentLifecycleProvider`, it needs to provide all inputs.
  // The audioRef can be created here.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Re-creating a minimal version of what `AppContents` needs from `useHandleServerEvent`'s return
  // This is just to satisfy the AgentLifecycleProvider prop if we render it here.
  // This is NOT a good final solution due to hook dependencies.
  const eventBus = useEventBus();
  const { addTranscriptBreadcrumb } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();
  // `sendToMachine` would come from `useMachine` if we init it here, but that's what Provider does.
  // `selectedAgentName` from machine, `selectedAgentConfigSet` from local state.

  // The props `agentConfigs`, `audioElement`, `isAudioPlaybackEnabled`, `urlCodec` are straightforward.
  // `handleServerEvent` is the challenge.

  // For now, I will proceed with the assumption that AgentLifecycleProvider is used in layout.tsx as previously discussed,
  // and App.tsx (now AppContents) is a consumer.
  // The removal of useKatoRTC from AppContents is the primary goal of this step.

  return <AppContents />;
  // If we were to instantiate Provider here, it would be like this:
  // return (
  //   <AgentLifecycleProvider 
  //      agentConfigs={medicalHistoryTakingAgents} // Example
  //      urlCodec={urlCodec}
  //      audioElement={audioRef.current} // Must ensure audioRef is populated
  //      isAudioPlaybackEnabled={true} // Example
  //      handleServerEvent={/* 어떻게든 여기서 handleServerEvent를 만들어야 함 */}
  //    >
  //     <audio ref={audioRef} id="kato-audio-element-provider" className="hidden" />
  //     <AppContents />
  //   </AgentLifecycleProvider>
  // );
};

export default App;

import { setup, createMachine, assign, fromPromise, sendTo, ActorRef } from 'xstate';
import { AgentConfig } from '@/app/types';
import { EventBus } from '@/app/lib/eventBus'; // Assuming path
import { createRealtimeConnection } from '@/app/lib/realtimeConnection'; // Assuming path
import { KatoEvents } from '@/app/cases/kato/KatoEvents'; // Added import

// Define the actual RTC types if available, or use any for now
// These should ideally come from lib.dom.d.ts or a WebRTC type definition package
type RTCPeerConnectionType = any; // Replace with actual RTCPeerConnection type
type RTCDataChannelType = any;    // Replace with actual RTCDataChannel type
type RTCErrorEventType = any;     // Replace with actual RTCErrorEvent type

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface AgentLifecycleMachineInput {
  agentConfigs: AgentConfig[];
  urlCodec: string;
  audioElement: HTMLAudioElement | null; // This is tricky, actor shouldn't directly manage DOM if possible
  eventBus: EventBus; // For createServerEventHandler and other potential bus interactions
  addTranscriptBreadcrumb: (message: string) => void;
  logClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: any, eventNameSuffix?: string) => void;
  isAudioPlaybackEnabled: boolean;
  // handleServerEvent: (serverMessage: any) => void; // Removed
}

export interface AgentLifecycleMachineContext {
  agentConfigs: AgentConfig[];
  urlCodec: string;
  audioElement: HTMLAudioElement | null;
  eventBus: EventBus;
  addTranscriptBreadcrumb: (message: string) => void;
  logClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: any, eventNameSuffix?: string) => void;
  isAudioPlaybackEnabled: boolean;

  selectedAgentName?: string;
  currentAgentConfig?: AgentConfig | null;
  error?: string | object; 
  playedAgentIntros: Set<string>;
  sessionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  pc?: RTCPeerConnectionType | null;
  dc?: RTCDataChannelType | null;
  lastServerMessage?: any; // Added for one-shot event handling
}

export type AgentLifecycleMachineEvent =
  | { type: 'SELECT_AGENT'; agentName: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL_SWITCH' }
  | { type: 'RTC_CONNECTED' }
  | { type: 'RTC_DISCONNECTED'; reason?: string; manual?: boolean; isSwitchingAgent?: boolean }
  | { type: 'RTC_CONNECTION_FAILED'; error: any }
  | { type: 'INTRO_PLAYBACK_COMPLETED'; agentName: string; success: boolean; error?: string }
  | { type: 'INTRO_NEEDS_USER_INTERACTION'; agentName: string }
  | { type: 'USER_CONFIRMED_AUDIO_MODAL' }
  | { type: 'USER_REQUESTED_DISCONNECT' }
  | { type: 'RTC_DATA_CHANNEL_ERROR_DETECTED'; error: any }
  | { type: 'SERVER_REQUESTED_AGENT_TRANSFER'; agentName: string }
  | { type: 'AUDIO_ELEMENT_READY'; audioElement: HTMLAudioElement }
  | { type: 'RTC_SERVER_MESSAGE_RECEIVED'; serverMessage: any };

type SpecificEvent<T extends AgentLifecycleMachineEvent['type']> = Extract<AgentLifecycleMachineEvent, { type: T }>;


export const agentLifecycleMachine = setup({
  types: {
    context: {} as AgentLifecycleMachineContext,
    events: {} as AgentLifecycleMachineEvent,
    input: {} as AgentLifecycleMachineInput,
  },
  actions: {
    findAgentConfigAction: assign(({
      context,
      event
    }) => {
      console.log(`[XState] Looking for agent: ${context.selectedAgentName}`);
      const agent = context.agentConfigs.find(a => a.name === context.selectedAgentName);
      if (!agent) {
        console.error(`[XState] Agent config NOT FOUND for ${context.selectedAgentName}`);
      } else {
        console.log(`[XState] Agent config found for ${context.selectedAgentName}`);
      }
      return {
        currentAgentConfig: agent || null
      };
    }),
    markIntroPlayedAction: assign(({
      context,
      event
    }) => {
      const specificEvent = event as SpecificEvent<'INTRO_PLAYBACK_COMPLETED'>;
      if (specificEvent.type === 'INTRO_PLAYBACK_COMPLETED' && specificEvent.success && specificEvent.agentName) {
        const newSet = new Set(context.playedAgentIntros);
        newSet.add(specificEvent.agentName);
        return {
          playedAgentIntros: newSet
        };
      }
      return {};
    }),
    assignErrorFromEventData: assign(({
      context,
      event
    }) => {
      return {
        error: (event as any).data
      };
    }),
    assignErrorFromServiceEvent: assign(({
      context,
      event
    }) => {
      return {
        error: (event as any).error
      };
    }),
    clearError: assign({
      error: undefined
    }),
    clearSelectionAndConfig: assign({
      selectedAgentName: undefined,
      currentAgentConfig: null,
      error: undefined,
    }),
    setConnectingStatus: assign({
      sessionStatus: 'CONNECTING' as const
    }),
    setConnectedStatus: assign({
      sessionStatus: 'CONNECTED' as const
    }),
    setDisconnectedStatus: assign({
      sessionStatus: 'DISCONNECTED' as const
    }),
    setErrorStatus: assign({
      sessionStatus: 'ERROR' as const
    }),
    setSelectedAgentName: assign(({
      context,
      event
    }) => {
      return {
        selectedAgentName: (event as SpecificEvent<'SELECT_AGENT'>).agentName
      };
    }),
    storeRtcRefsFromDoneEvent: assign({
      pc: ({ event }: { event: { output?: { pc?: RTCPeerConnectionType, dc?: RTCDataChannelType } } }) => {
          console.log("[XState] Storing peer connection reference");
          return event.output?.pc;
      },
      dc: ({ event }: { event: { output?: { pc?: RTCPeerConnectionType, dc?: RTCDataChannelType } } }) => {
          console.log("[XState] Storing data channel reference");
          return event.output?.dc;
      }
    }),
    clearRtcRefs: assign({
      pc: null,
      dc: null,
      sessionStatus: 'DISCONNECTED',
      lastServerMessage: undefined, // Clear last message on disconnect
    }),
    assignLastServerMessage: assign({
      lastServerMessage: ({ event }) => {
        const serverMessage = (event as SpecificEvent<'RTC_SERVER_MESSAGE_RECEIVED'>).serverMessage;
        console.log('[XState] Server message received:', serverMessage.type);
        return serverMessage;
      },
    }),
    clearLastServerMessage: assign({
      lastServerMessage: undefined,
    }),
    logBreadcrumbSwitching: ({ context }) => {
      console.log(`[XState] Switching to agent: ${context.selectedAgentName}`);
      context.addTranscriptBreadcrumb(`Switching to agent: ${context.selectedAgentName}`);
    },
    logBreadcrumbActivating: ({ context }) => {
      console.log(`[XState] Activating agent: ${context.currentAgentConfig?.name}`);
      context.addTranscriptBreadcrumb(`Activating agent: ${context.currentAgentConfig?.name}`);
    },
    logBreadcrumbConnecting: ({ context }) => {
      console.log(`[XState] Connecting to agent: ${context.currentAgentConfig?.name}`);
      context.addTranscriptBreadcrumb(`Connecting to agent: ${context.currentAgentConfig?.name}`);
    },
    logBreadcrumbAgentActive: ({ context }) => {
      console.log(`[XState] Agent active: ${context.currentAgentConfig?.name}`);
      context.addTranscriptBreadcrumb(`Agent active: ${context.currentAgentConfig?.name}`);
    },
    logBreadcrumbDisconnectingManually: ({context}) => {
      console.log("[XState] Disconnecting manually");
      context.addTranscriptBreadcrumb('Disconnecting...');
    },
    logErrorSwitchFailed: ({ context }) => {
      console.error(`[XState] Switch failed: ${context.error}`);
      context.addTranscriptBreadcrumb(`Error: Switch failed. ${context.error}`);
    },
    logErrorIntroFailed: ({ context }) => {
      console.error(`[XState] Intro playback failed: ${context.error}`);
      context.addTranscriptBreadcrumb(`Error: Intro failed. ${context.error}`);
    },
    logErrorConnectionFailed: ({ context }) => {
      console.error(`[XState] Connection failed: ${context.error}`);
      context.addTranscriptBreadcrumb(`Error: Connection failed. ${context.error}`);
    },
    assignRtcEventHandlers: assign(({ context, self, system }) => {
      const { dc } = context;
      if (dc) {
        console.log("[XState] Setting up RTC event handlers");
        dc.onmessage = (event: MessageEvent) => {
          try {
            const serverMessage = JSON.parse(event.data);
            // If it's a direct agent transfer request, send a specific machine event
            if (serverMessage.type === 'session.transfer_agent.request' && serverMessage.agent_name) {
              console.log('[XState] Detected agent transfer request:', serverMessage.agent_name);
              self.send({ type: 'SERVER_REQUESTED_AGENT_TRANSFER', agentName: serverMessage.agent_name });
            } else {
              // For other messages, send the generic RTC_SERVER_MESSAGE_RECEIVED
              self.send({ type: 'RTC_SERVER_MESSAGE_RECEIVED', serverMessage });
            }
          } catch (e) {
            console.error("[XState] Error parsing server message:", e);
          }
        };
        dc.onclose = () => {
          console.log("[XState] Data channel closed");
          self.send({ type: 'RTC_DISCONNECTED', reason: 'dc_closed' });
        };
        dc.onerror = (event: Event) => {
          console.error("[XState] Data channel error:", event);
          self.send({ type: 'RTC_CONNECTION_FAILED', error: (event as any)?.message || 'Unknown DC error' });
        };
      } else {
        console.warn("[XState] Cannot set up RTC event handlers - DC is null");
      }
      return {}; // No context change, just side effects
    }),
    clearRtcEventHandlers: assign(({ context }) => {
      const { dc } = context;
      if (dc) {
        console.log("[XState] Clearing RTC event handlers");
        dc.onmessage = null;
        dc.onclose = null;
        dc.onerror = null;
      }
      return {}; // No context change, just side effects
    }),
    processAndRelayServerMessage: ({ context, event }) => {
      const rtcEvent = event as Extract<AgentLifecycleMachineEvent, { type: 'RTC_SERVER_MESSAGE_RECEIVED' }>;
      const serverMessage = rtcEvent.serverMessage;
      
      const { eventBus } = context;

      if (!serverMessage || !serverMessage.type) {
        console.warn('[XState] Received empty or typeless server message');
        return;
      }

      console.log('[XState] Processing message:', serverMessage.type);

      // Handle user's completed speech transcription
      if (serverMessage.type === 'conversation.item.input_audio_transcription.completed') {
        if (serverMessage.item_id && typeof serverMessage.transcript === 'string') {
          console.log(`[XState] User transcript completed: "${serverMessage.transcript}"`);
          eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM, {
            idToAssign: serverMessage.item_id,
            role: 'user',
            title: serverMessage.transcript,
            isLocal: true,
          });
          // Explicitly ask the server to create a response
          console.log('[XState] Requesting agent response');
          eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
            eventObj: { type: "response.create" },
            eventNameSuffix: "response_create_after_user_transcript_completed_xstate"
          });
        } else {
          console.warn('[XState] Malformed conversation.item.input_audio_transcription.completed');
        }
      }
      // Handle assistant's completed message item
      else if (serverMessage.type === 'response.output_item.done' && serverMessage.item?.type === 'message' && serverMessage.item?.role === 'assistant') {
        let textContent: string | undefined = undefined;
        const firstContent = serverMessage.item.content?.[0];

        if (firstContent) {
          if (firstContent.type === 'audio' && typeof firstContent.transcript === 'string') {
            textContent = firstContent.transcript;
          } else if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
            textContent = firstContent.text;
          }
        }
        
        if (serverMessage.item.id && typeof textContent === 'string') {
          console.log(`[XState] Assistant transcript complete: "${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}"`);
          eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM, {
            idToAssign: serverMessage.item.id,
            role: 'assistant',
            title: textContent,
          });
        } else {
          console.warn('[XState] Malformed response.output_item.done for assistant message');
        }
      }
      // Handle output audio buffer status
      else if (serverMessage.type === 'output_audio_buffer.started') {
        console.log('[XState] Output audio buffer started');
        eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, true);
      } else if (serverMessage.type === 'output_audio_buffer.stopped' || serverMessage.type === 'output_audio_buffer.done') {
        console.log('[XState] Output audio buffer stopped/done');
        eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, false);
      }
      // Log receivers when server indicates audio is done sending
      else if (serverMessage.type === 'response.audio.done') {
        console.log('[XState] Audio response done');
      }
      // User actual speech VAD events (from server VAD)
      else if (serverMessage.type === 'input_audio_transcription.user_speech.started') {
        console.log('[XState] User speech started (server VAD)');
        eventBus.emit(KatoEvents.USER_SPEECH_STARTED);
      } else if (serverMessage.type === 'input_audio_transcription.user_speech.stopped') {
        console.log('[XState] User speech stopped (server VAD)');
        eventBus.emit(KatoEvents.USER_SPEECH_STOPPED);
      }
    },
    assignAudioElement: assign(({
      context,
      event
    }) => {
      const specificEvent = event as SpecificEvent<'AUDIO_ELEMENT_READY'>;
      if (specificEvent.audioElement) {
        console.log('[XState] Updated audio element in context');
        return {
          audioElement: specificEvent.audioElement
        };
      }
      return {};
    }),
  },
  actors: {
    fetchTokenAndConnectRTC: fromPromise(async ({ input, self }) => {
      return new Promise(async (resolve, reject) => {
        const currentContext = input as AgentLifecycleMachineContext;
        const {
            urlCodec,
            audioElement,
            eventBus,
            addTranscriptBreadcrumb, // This is console.log for now
            logClientEvent,
            logServerEvent,
            isAudioPlaybackEnabled,
          } = currentContext;

        try {
            console.log("[XState DEBUG] fetchTokenAndConnectRTC: Connecting to Realtime (XState Actor)...");
            logClientEvent({ url: "/session" }, "fetch_session_token_request_xstate");

            const tokenResponse = await fetch(`${API_BASE_URL}/api/v1/session`, { method: "POST" });
            if (!tokenResponse.ok) {
              const errorText = await tokenResponse.text();
              const err = new Error(`Token fetch failed: ${tokenResponse.status} ${errorText}`);
              console.error("[XState DEBUG] fetchTokenAndConnectRTC:", err);
              return reject(err);
            }
            const data = await tokenResponse.json();
            logServerEvent(data, "fetch_session_token_response_xstate");
    
            if (!data.client_secret?.value) {
              const err = new Error("No ephemeral key provided by the server");
              console.error("[XState DEBUG] fetchTokenAndConnectRTC:", err);
              return reject(err);
            }
            const EPHEMERAL_KEY = data.client_secret.value;
    
            if (audioElement && typeof isAudioPlaybackEnabled === 'boolean') {
              audioElement.autoplay = isAudioPlaybackEnabled;
            }
            const tempAudioElementRef = { current: audioElement };

            const { pc, dc } = await createRealtimeConnection(EPHEMERAL_KEY, tempAudioElementRef, urlCodec);
            
            if (dc) {
              dc.onopen = () => {
                console.log("[XState DEBUG] fetchTokenAndConnectRTC: Data channel open.");
                console.log("[XState DEBUG] Realtime connection established (XState Actor).");
                // The promise resolving handles the transition via onDone in the invoking state.
                // No need to send RTC_CONNECTED from here.
                resolve({ pc, dc }); 
              };
              dc.onerror = (event: Event) => {
                const errorMessage = (event as any)?.message || 'Unknown DC error during setup';
                console.error("[XState DEBUG] fetchTokenAndConnectRTC: Data channel error during setup.", event);
                reject(new Error(errorMessage));
              };
              dc.onclose = () => { 
                console.warn("[XState DEBUG] fetchTokenAndConnectRTC: Data channel closed unexpectedly during setup phase.");
                reject(new Error('RTCDataChannel closed unexpectedly during setup'));
              };
            } else {
              console.error("[XState DEBUG] fetchTokenAndConnectRTC: Data channel is null after createRealtimeConnection.");
              console.error("[XState DEBUG] Failed to establish Realtime data channel (XState Actor).");
              reject(new Error('RTCDataChannel is null after creation'));
            }

        } catch (error: any) {
            console.error('[XState DEBUG] fetchTokenAndConnectRTC: Error during connection setup:', error);
            // addTranscriptBreadcrumb(`Error connecting to Realtime: ${error.message}`);
            console.error(`[XState DEBUG] Error connecting to Realtime: ${error.message}`);
            logClientEvent({ error: error.message, name: error.name }, "connection_error_xstate");
            if (error.name === 'NotAllowedError') {
                // addTranscriptBreadcrumb("Microphone access denied. Switched to text input mode.");
                console.warn("[XState DEBUG] fetchTokenAndConnectRTC: Microphone access denied.");
                eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text');
                eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, 'no_mic');
                eventBus.emit(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED);
              }
            reject(error); 
        }
      });
    }),
    playAgentIntro: fromPromise(async ({ input }) => {
      const currentContext = input as AgentLifecycleMachineContext;
      let { 
        currentAgentConfig,
        audioElement, // This can be null
        eventBus,
        addTranscriptBreadcrumb, // This will be console.log for now
        isAudioPlaybackEnabled,
        logClientEvent,
      } = currentContext;

      const agentName = currentAgentConfig?.name || 'unknown';

      if (!currentAgentConfig || !currentAgentConfig.introAudio?.text) {
        // addTranscriptBreadcrumb(`[XState Actor] No intro text for ${agentName}, skipping playback.`);
        console.log(`[XState Actor] No intro text for ${agentName}, skipping playback.`);
        return { agentName, success: true }; 
      }

      // addTranscriptBreadcrumb(`[XState Actor] Preparing intro for ${agentName}...`);
      console.log(`[XState Actor] Preparing intro for ${agentName}...`);
      logClientEvent({ agentName }, "play_intro_actor_started");

      // Manage audio element internally if not provided or not usable
      let localAudioElement: HTMLAudioElement;
      if (audioElement && typeof audioElement.play === 'function') { // Check if it looks like a valid audio element
        localAudioElement = audioElement;
      } else {
        console.warn(`[XState Actor] audioElement from context is null or not usable for ${agentName}. Creating a new one for this intro.`);
        localAudioElement = new Audio();
      }

      // Ensure isAudioPlaybackEnabled is applied if relevant to the localAudioElement
      if (typeof isAudioPlaybackEnabled === 'boolean') {
        localAudioElement.autoplay = isAudioPlaybackEnabled; // Note: autoplay after src is set might be more reliable for some browsers.
      }

      let audioBlobUrl: string | null = null;

      try {
        // addTranscriptBreadcrumb(`[XState Actor] Fetching intro audio for ${agentName}...`);
        console.log(`[XState Actor] Fetching intro audio for ${agentName}...`);
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

        if (!response.ok) {
          const errorData = await response.text();
          const errorMsg = `Failed to fetch intro audio for ${agentName}: ${response.status} ${errorData}`;
          throw new Error(errorMsg);
        }

        const audioBlob = await response.blob();
        audioBlobUrl = URL.createObjectURL(audioBlob);
        localAudioElement.src = audioBlobUrl;
        if (localAudioElement.autoplay) { // If autoplay was set, some browsers might require play() to be called again or after src set
            console.log("[XState Actor] Attempting to honor autoplay after setting src.");
        }

        // Return a new promise that resolves/rejects based on audio events
        return new Promise((resolve, reject) => {
          localAudioElement.onended = () => {
            // addTranscriptBreadcrumb(`[XState Actor] Intro audio finished for ${agentName}.`);
            console.log(`[XState Actor] Intro audio finished for ${agentName}.`);
            logClientEvent({ agentName }, "play_intro_actor_ended");
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            resolve({ agentName, success: true });
          };

          localAudioElement.onerror = (e) => {
            const errorMsg = `[XState Actor] Intro audio error for ${agentName}.`;
            console.error(errorMsg, e); // Log the original event object
            // addTranscriptBreadcrumb(errorMsg);
            console.error(errorMsg);
            logClientEvent({ agentName, error: (e instanceof ErrorEvent ? e.message : String(e)) }, "play_intro_actor_audio_error");
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            resolve({ agentName, success: false, error: "Audio playback error" });
          };

          // addTranscriptBreadcrumb(`[XState Actor] Attempting to play intro for ${agentName}...`);
          console.log(`[XState Actor] Attempting to play intro for ${agentName}...`);
          localAudioElement.play()
            .then(() => {
              // addTranscriptBreadcrumb(`[XState Actor] Intro playback started for ${agentName}.`);
              console.log(`[XState Actor] Intro playback started for ${agentName}.`);
              logClientEvent({ agentName }, "play_intro_actor_playback_started");
              // The promise resolves via onended or onerror
            })
            .catch(playError => {
              let errorType = "Playback failed";
              let needsUserInteraction = false;
              if (playError.name === "NotAllowedError") {
                errorType = "Playback requires user interaction (NotAllowedError)";
                needsUserInteraction = true;
                // addTranscriptBreadcrumb(`[XState Actor] Intro playback for ${agentName} requires user interaction.`);
                console.warn(`[XState Actor] Intro playback for ${agentName} requires user interaction.`);
              } else {
                // addTranscriptBreadcrumb(`[XState Actor] Error playing intro for ${agentName}: ${playError.message}`);
                console.error(`[XState Actor] Error playing intro for ${agentName}: ${playError.message}`);
              }
              logClientEvent({ agentName, error: playError.message, name: playError.name }, "play_intro_actor_play_catch");
              if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
              resolve({ agentName, success: false, error: errorType, needsUserInteraction });
            });
        });

      } catch (error: any) {
        const errorMsg = `[XState Actor] Error in playIntro for ${agentName}: ${error.message}`;
        // addTranscriptBreadcrumb(errorMsg);
        console.error(errorMsg);
        logClientEvent({ agentName, error: error.message }, "play_intro_actor_general_error");
        if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
        // This error will be caught by onError in the invoke definition
        // To align with resolving the promise, we can do:
        return { agentName, success: false, error: error.message, needsUserInteraction: error.name === "NotAllowedError" };
      }
    }),
    disconnectRTC: fromPromise(async ({ input }) => {
      // Input is the machine's context, which includes pc, dc, addTranscriptBreadcrumb, logClientEvent
      // It also needs an 'isSwitching' flag, passed when invoking the actor.
      const currentContext = input as AgentLifecycleMachineContext & { isSwitching?: boolean };
      const { pc, dc, addTranscriptBreadcrumb, logClientEvent, isSwitching } = currentContext;

      const mode = isSwitching ? "for agent switch" : "manually";
      addTranscriptBreadcrumb(`[XState Actor] Disconnecting RTC (${mode})...`);
      if (logClientEvent) {
        logClientEvent({ isSwitching }, "rtc_disconnect_actor_started");
      }

      try {
        if (pc) {
          // Stop all tracks for all senders
          const senders = pc.getSenders();
          senders.forEach((sender: RTCRtpSender) => {
            if (sender.track) {
              sender.track.stop();
            }
          });
          pc.close();
        }

        if (dc) {
          // Clear handlers to prevent any further events if not already handled by pc.close()
          dc.onopen = null;
          dc.onclose = null;
          dc.onerror = null;
          dc.onmessage = null;
          // dc.close(); // pc.close() should handle closing the data channel as well.
        }

        addTranscriptBreadcrumb("[XState Actor] RTC Disconnected.");
        if (logClientEvent) {
          logClientEvent({ isSwitching }, "rtc_disconnect_actor_completed");
        }
        // Resolve the promise to signal completion. 
        // The machine will then transition and run actions like 'clearRtcRefs' and 'setDisconnectedStatus'.
        return Promise.resolve(); 
      } catch (error) {
        addTranscriptBreadcrumb(`[XState Actor] Error during RTC disconnection: ${error}`);
        if (logClientEvent) {
          logClientEvent({ error, isSwitching }, "rtc_disconnect_actor_error");
        }
        // Propagate the error if any operation unexpectedly throws
        return Promise.reject(error);
      }
    }),
  },
  guards: {
    isConnectedCond: ({ context }) => context.sessionStatus === 'CONNECTED' || context.sessionStatus === 'CONNECTING',
    introNeededCond: ({ context, event }) => {
      const agentName = context.selectedAgentName;
      const agentConfig = context.currentAgentConfig;
      if (!agentName || !agentConfig || !agentConfig.introAudio?.text) return false;
      return !context.playedAgentIntros.has(agentName);
    },
    isSwitchingAgentGuard: ({ event }) => (event as SpecificEvent<'RTC_DISCONNECTED'>).isSwitchingAgent === true,
    isManualDisconnectGuard: ({ event }) => (event as SpecificEvent<'RTC_DISCONNECTED'>).manual === true,
    introPlayedSuccessfullyGuard: ({ event }) => (event as SpecificEvent<'INTRO_PLAYBACK_COMPLETED'>).success,
    isAgentIntroAlreadyPlayed: ({ context }) => {
      if (!context.currentAgentConfig || !context.currentAgentConfig.introAudio?.text) return true;
      return context.playedAgentIntros.has(context.currentAgentConfig.name);
    },
    isUnexpectedRtcDisconnect: ({ event }) => {
      const rtcEvent = event as SpecificEvent<'RTC_DISCONNECTED'>;
      return rtcEvent.type === 'RTC_DISCONNECTED' && rtcEvent.manual === false && rtcEvent.isSwitchingAgent === false;
    },
    isSwitchingAgentRtcDisconnect: ({ event }) => {
      const rtcEvent = event as SpecificEvent<'RTC_DISCONNECTED'>;
      return rtcEvent.type === 'RTC_DISCONNECTED' && rtcEvent.isSwitchingAgent === true;
    },
    isManualRtcDisconnect: ({ event }) => {
      const rtcEvent = event as SpecificEvent<'RTC_DISCONNECTED'>;
      return rtcEvent.type === 'RTC_DISCONNECTED' && rtcEvent.manual === true;
    }
  },
}).createMachine({
  id: 'katoAgentLifecycle',
  initial: 'idle',
  context: ({ input }) => ({
    agentConfigs: input.agentConfigs,
    urlCodec: input.urlCodec,
    audioElement: input.audioElement,
    eventBus: input.eventBus,
    addTranscriptBreadcrumb: input.addTranscriptBreadcrumb,
    logClientEvent: input.logClientEvent,
    logServerEvent: input.logServerEvent,
    isAudioPlaybackEnabled: input.isAudioPlaybackEnabled,

    selectedAgentName: undefined,
    currentAgentConfig: null,
    error: undefined,
    playedAgentIntros: new Set<string>(),
    sessionStatus: 'DISCONNECTED',
    pc: null,
    dc: null,
    lastServerMessage: undefined,
  }),
  on: {
    RTC_CONNECTED: {
      target: '#katoAgentLifecycle.agentActive',
      actions: ['setConnectedStatus'],
    },
    RTC_DISCONNECTED: { 
        target: '#katoAgentLifecycle.connectionError',
        actions: ['setDisconnectedStatus', 'clearRtcRefs', 'assignErrorFromServiceEvent', 'logErrorConnectionFailed'],
    },
    RTC_CONNECTION_FAILED: {
      target: '#katoAgentLifecycle.connectionError',
      actions: ['setErrorStatus', 'assignErrorFromServiceEvent', 'clearRtcRefs', 'logErrorConnectionFailed'],
    },
    /* The following global RTC_SERVER_MESSAGE_RECEIVED handler is commented out
       to ensure the agentActive state's specific handler has full control and access to the event payload.
    RTC_SERVER_MESSAGE_RECEIVED: { 
      actions: ['assignLastServerMessage'] 
    }, 
    */
    RTC_DATA_CHANNEL_ERROR_DETECTED: { 
      target: '#katoAgentLifecycle.connectionError',
      actions: ['assignErrorFromServiceEvent', 'setErrorStatus', 'clearRtcRefs', 'logErrorConnectionFailed']
    }
  },
  states: {
    idle: {
      entry: ['clearSelectionAndConfig', 'clearRtcRefs', 'setDisconnectedStatus'],
      on: {
        SELECT_AGENT: {
          target: 'preparingToSwitch',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'clearError', 'logBreadcrumbSwitching']
        },
        SERVER_REQUESTED_AGENT_TRANSFER: { 
          target: 'preparingToSwitch',
          actions: [
            assign({ 
              selectedAgentName: ({ event }) => (event as SpecificEvent<'SERVER_REQUESTED_AGENT_TRANSFER'>).agentName
            }),
            'findAgentConfigAction',
            'clearError',
            'logBreadcrumbSwitching'
          ]
        },
        USER_REQUESTED_DISCONNECT: {
          target: 'disconnectingManually',
          actions: ['logBreadcrumbDisconnectingManually']
        },
        RTC_DISCONNECTED: {
          target: 'idle',
          actions: ['clearRtcRefs', 'setDisconnectedStatus']
        },
        AUDIO_ELEMENT_READY: {
          actions: ['assignAudioElement']
        }
      },
    },
    preparingToSwitch: {
      entry: ['findAgentConfigAction', 'logBreadcrumbSwitching'],
      always: [
        {
          guard: 'isAgentIntroAlreadyPlayed',
          target: '#katoAgentLifecycle.disconnectingForSwitch'
        },
        { target: '#katoAgentLifecycle.activatingAgent' },
      ],
    },
    disconnectingForSwitch: {
      invoke: {
        id: 'disconnectForSwitchActor',
        src: 'disconnectRTC',
        input: ({ context }) => ({ ...context, isSwitching: true }),
        onDone: '#katoAgentLifecycle.activatingAgent',
        onError: {
          target: '#katoAgentLifecycle.switchError',
          actions: ['assignErrorFromEventData', 'setErrorStatus', 'logErrorSwitchFailed']
        }
      },
    },
    activatingAgent: {
      entry: ['logBreadcrumbActivating'],
      always: [
        { target: '#katoAgentLifecycle.playingIntro', guard: 'introNeededCond' },
        { target: '#katoAgentLifecycle.connecting' },
      ],
    },
    playingIntro: {
      invoke: {
        id: 'playAgentIntro',
        src: 'playAgentIntro',
        input: ({context}) => context,
        onDone: [
            {
                target: '#katoAgentLifecycle.awaitingAudioModalConfirmation',
                guard: ({ event }) => (event.output as { success: boolean, needsUserInteraction?: boolean }).needsUserInteraction === true,
                actions: assign (({event}) => {
                    const output = event.output as {error?: string, needsUserInteraction?: boolean};
                    if (output.needsUserInteraction && output.error) {
                        return { error: output.error };
                    }
                    return {};
                })
            },
            {
                target: '#katoAgentLifecycle.connecting',
                guard: ({ event }) => (event.output as { success: boolean }).success, 
                actions: assign (({context, event}) => {
                    const output = event.output as {agentName: string, success: boolean};
                    if (output.success && output.agentName) {
                        const newSet = new Set(context.playedAgentIntros);
                        newSet.add(output.agentName);
                        return { playedAgentIntros: newSet };
                    }
                    return {};
                })
            },
            {
                target: '#katoAgentLifecycle.errorIntroFailed',
                actions: assign (({event}) => ({ error: (event.output as {error?: string}).error || 'Intro playback failed due to unhandled outcome' }))
            }
        ],
        onError: {
          target: '#katoAgentLifecycle.errorIntroFailed',
          actions: ['assignErrorFromEventData'],
        },
      },
      on: {
        CANCEL_SWITCH: { target: '#katoAgentLifecycle.idle', actions: ['clearSelectionAndConfig', 'clearRtcRefs', 'setDisconnectedStatus'] }
      },
    },
    awaitingAudioModalConfirmation: {
        on: {
            USER_CONFIRMED_AUDIO_MODAL: { target: '#katoAgentLifecycle.playingIntro' },
            CANCEL_SWITCH: { target: '#katoAgentLifecycle.idle', actions: ['clearSelectionAndConfig', 'clearRtcRefs', 'setDisconnectedStatus'] },
        },
    },
    connecting: {
      entry: ['logBreadcrumbConnecting', 'setConnectingStatus'],
      invoke: {
        id: 'connectAgentActor',
        src: 'fetchTokenAndConnectRTC',
        input: ({context}) => context,
        onDone: {
          target: '#katoAgentLifecycle.agentActive',
          actions: ['storeRtcRefsFromDoneEvent']
        },
        onError: {
          target: '#katoAgentLifecycle.connectionError',
          actions: ['assignErrorFromEventData', 'setErrorStatus', 'logErrorConnectionFailed', 'clearRtcRefs']
        }
      },
      on: {
        SELECT_AGENT: {
          target: '#katoAgentLifecycle.disconnectingForSwitch',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'logBreadcrumbSwitching']
        },
        CANCEL_SWITCH: { 
          target: '#katoAgentLifecycle.idle',
          actions: ['clearSelectionAndConfig', 'clearRtcRefs', 'setDisconnectedStatus']
        }
      }
    },
    agentActive: {
      entry: ['logBreadcrumbAgentActive', 'setConnectedStatus', 'assignRtcEventHandlers'],
      exit: ['clearRtcEventHandlers'], // Clear handlers on exit
      on: {
        RTC_DISCONNECTED: [
          {
            guard: 'isUnexpectedRtcDisconnect',
            target: '#katoAgentLifecycle.connectionError',
            actions: ['setDisconnectedStatus', 'clearRtcRefs', 'assignErrorFromServiceEvent', 'logErrorConnectionFailed']
          },
          {
            guard: 'isSwitchingAgentRtcDisconnect', 
            target: '#katoAgentLifecycle.activatingAgent',
            actions: ['setDisconnectedStatus', 'clearRtcRefs']
          },
          {
            guard: 'isManualRtcDisconnect',
            target: '#katoAgentLifecycle.idle',
            actions: ['setDisconnectedStatus', 'clearRtcRefs', 'clearSelectionAndConfig']
          }
        ],
        SELECT_AGENT: {
          target: '#katoAgentLifecycle.disconnectingForSwitch',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'logBreadcrumbSwitching']
        },
        USER_REQUESTED_DISCONNECT: {
          target: '#katoAgentLifecycle.disconnectingManually'
        },
        SERVER_REQUESTED_AGENT_TRANSFER: { 
          target: '#katoAgentLifecycle.disconnectingForSwitch',
          actions: [
            assign({ 
              selectedAgentName: ({ event }) => (event as SpecificEvent<'SERVER_REQUESTED_AGENT_TRANSFER'>).agentName 
            }),
            'findAgentConfigAction',
            'logBreadcrumbSwitching'
          ]
        },
        RTC_SERVER_MESSAGE_RECEIVED: {
          actions: ['assignLastServerMessage', 'processAndRelayServerMessage']
        },
        AUDIO_ELEMENT_READY: {
          actions: ['assignAudioElement']
        }
      }
    },
    disconnectingManually: {
      entry: ['logBreadcrumbDisconnectingManually'],
      invoke: {
        id: 'disconnectManuallyActor',
        src: 'disconnectRTC',
        input: ({ context }) => ({ ...context, isSwitching: false }),
        onDone: {
          target: '#katoAgentLifecycle.idle',
          actions: ['setDisconnectedStatus', 'clearRtcRefs', 'clearSelectionAndConfig']
        },
        onError: { 
          target: '#katoAgentLifecycle.idle',
          actions: ['assignErrorFromEventData', 'setDisconnectedStatus', 'clearRtcRefs', 'clearSelectionAndConfig', 'logErrorConnectionFailed']
        }
      },
    },
    switchError: {
      entry: ['logErrorSwitchFailed', 'setErrorStatus', 'clearRtcRefs'],
      on: {
        RETRY: '#katoAgentLifecycle.preparingToSwitch',
        SELECT_AGENT: {
          target: '#katoAgentLifecycle.idle',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'clearError', 'logBreadcrumbSwitching']
        },
        USER_REQUESTED_DISCONNECT: { target: '#katoAgentLifecycle.disconnectingManually' },
        CANCEL_SWITCH: { target: '#katoAgentLifecycle.idle', actions: ['clearSelectionAndConfig', 'setDisconnectedStatus'] }
      },
    },
    errorIntroFailed: {
      entry: ['logErrorIntroFailed', 'setErrorStatus'],
      on: {
        RETRY: '#katoAgentLifecycle.playingIntro',
        CANCEL_SWITCH: { target: '#katoAgentLifecycle.idle', actions: ['clearSelectionAndConfig', 'clearRtcRefs', 'setDisconnectedStatus'] },
        SELECT_AGENT: {
          target: '#katoAgentLifecycle.idle',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'clearError', 'logBreadcrumbSwitching']
        }
      },
    },
    connectionError: {
      entry: ['logErrorConnectionFailed', 'setErrorStatus', 'clearRtcRefs'],
      on: {
        RETRY: '#katoAgentLifecycle.connecting',
        SELECT_AGENT: {
          target: '#katoAgentLifecycle.idle',
          actions: ['setSelectedAgentName', 'findAgentConfigAction', 'clearError', 'logBreadcrumbSwitching']
        },
        USER_REQUESTED_DISCONNECT: { target: '#katoAgentLifecycle.disconnectingManually' },
        AUDIO_ELEMENT_READY: {
          actions: ['assignAudioElement']
        }
      },
    }
  }
});

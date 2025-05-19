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

  // Added for enhanced event emission
  previousAgentName?: string;
  isSwitchingGlobal?: boolean;
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
  | { type: 'RTC_SERVER_MESSAGE_RECEIVED'; serverMessage: any }
  // Added internal events
  | { type: '_INTERNAL_MARK_SWITCH_START_AND_EMIT' }
  | { type: '_INTERNAL_COMPLETE_SWITCH' }
  | { type: '_INTERNAL_FAIL_SWITCH' }
  // Tool execution feedback events (from tool executor to machine)
  | { type: 'TOOL_EXECUTOR_SUCCESS'; callId: string; functionName: string; result: any }
  | { type: 'TOOL_EXECUTOR_FAILURE'; callId: string; functionName: string; error: any };

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
      const newSelectedAgentName = (event as SpecificEvent<'SELECT_AGENT'>).agentName;
      return {
        selectedAgentName: newSelectedAgentName,
        previousAgentName: context.selectedAgentName, // Store old selected name here
        error: undefined, // Clear error on new selection attempt
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
      
      const { eventBus, logServerEvent, addTranscriptBreadcrumb, currentAgentConfig } = context;

      if (!serverMessage || !serverMessage.type) {
        console.warn('[XState] processAndRelayServerMessage: Received empty or typeless server message', serverMessage);
        return;
      }

      // Log the raw server message before processing
      logServerEvent(serverMessage, `machine_processing_${serverMessage.type}`);
      console.log(`[XState] processAndRelayServerMessage: Processing type '${serverMessage.type}'`, serverMessage);

      switch (serverMessage.type) {
        case 'session.created':
          if (serverMessage.session?.id) {
            eventBus.emit(KatoEvents.SERVER_SESSION_CREATED, { sessionId: serverMessage.session.id });
            addTranscriptBreadcrumb(
              `Session ID: ${serverMessage.session.id} (from machine)\nStarted at: ${new Date().toLocaleString()}`
            );
          } else {
            console.warn('[XState] Malformed session.created:', serverMessage);
          }
          break;

        case 'output_audio_buffer.started':
          eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, true);
          break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.done': // Treat done same as stopped for status
          eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, false);
          break;

        case 'conversation.item.created': {
          const itemId = serverMessage.item?.id;
          const role = serverMessage.item?.role as 'user' | 'assistant' | 'system' | 'function_call' | 'function_call_output';
          let textContent: string | undefined;
          const firstContent = serverMessage.item?.content?.[0];

          if (firstContent) {
            if (firstContent.type === 'text') textContent = firstContent.text;
            else if (firstContent.type === 'input_text') textContent = firstContent.text;
            else if (firstContent.type === 'audio') textContent = firstContent.transcript;
            else if (role === 'user' && !textContent) textContent = "[Processing...]";
          } else if (role === 'user') {
            textContent = "[Processing user input...]";
          }
          
          if (itemId && role) {
            eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, { itemId, role, text: textContent || "" });
          } else {
            console.warn('[XState] Malformed conversation.item.created:', serverMessage);
          }
          break;
        }

        case 'conversation.item.input_audio_transcription.completed':
          if (serverMessage.item_id && typeof serverMessage.transcript === 'string') {
            eventBus.emit(KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED, { 
              itemId: serverMessage.item_id, 
              transcript: serverMessage.transcript 
            });
            // Request agent response
            eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
              eventObj: { type: "response.create" },
              eventNameSuffix: "response_create_after_user_transcript_completed_xstate_machine"
            });
          } else {
            console.warn('[XState] Malformed conversation.item.input_audio_transcription.completed:', serverMessage);
          }
          break;

        case 'response.audio_transcript.delta': {
          const itemId = serverMessage.item_id;
          const deltaText = serverMessage.delta;
          if (itemId && typeof deltaText === 'string') {
            eventBus.emit(KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED, { itemId, deltaText });
          } else {
            // console.warn('[XState] Malformed response.audio_transcript.delta:', serverMessage); // Can be noisy
          }
          break;
        }
        
        case 'response.output_item.done': {
          const item = serverMessage.item;
          if (item && item.id && item.type === 'message' && item.role === 'assistant') {
            let textContent: string | undefined = undefined;
            const firstContent = item.content?.[0];
            if (firstContent) {
              if (firstContent.type === 'audio' && typeof firstContent.transcript === 'string') {
                textContent = firstContent.transcript;
              } else if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
                textContent = firstContent.text;
              }
            }
            if (textContent !== undefined) {
              eventBus.emit(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, { 
                itemId: item.id, 
                fullText: textContent,
              });
              eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE, {
                itemId: item.id,
                status: 'DONE', 
                finalText: textContent 
              });
            } else {
              console.warn('[XState] Malformed response.output_item.done (assistant message, missing text):', serverMessage);
            }
          } else if (item && item.type === 'function_call_output') {
            // Function call *results* are processed by the server and sent back.
            // This 'done' might relate to the server acknowledging it processed our function_call_output.
          } else {
            // console.warn('[XState] Unhandled or malformed response.output_item.done:', serverMessage);
          }
          break;
        }

        case 'response.done': {
          if (serverMessage.response?.output) {
            serverMessage.response.output.forEach((outputItem: any) => {
              if (outputItem.type === 'function_call' && outputItem.name && outputItem.arguments) {
                const callId = outputItem.call_id; // May be undefined from server, though good practice to have
                const functionName = outputItem.name;
                const argsString = outputItem.arguments;

                // Emit that a tool call has been identified and is starting
                eventBus.emit(KatoEvents.TOOL_CALL_STARTED, {
                  callId,
                  functionName,
                  argsString, // Keep argsString for consistency with SERVER_FUNCTION_CALL_REQUESTED
                });
                
                // Emit event for the tool executor to pick up
                eventBus.emit(KatoEvents.SERVER_FUNCTION_CALL_REQUESTED, {
                  callId, 
                  functionName,
                  argsString,
                });
              } else if (outputItem.type === 'message' && outputItem.role === 'assistant' && !outputItem.content?.[0]?.transcript && outputItem.content?.[0]?.text) {
                const itemId = outputItem.id;
                const textContent = outputItem.content?.[0]?.text;
                if (itemId && textContent) {
                   eventBus.emit(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, { 
                       itemId: itemId, 
                       fullText: textContent 
                   });
                   eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE, {
                       itemId: itemId,
                       status: 'DONE',
                       finalText: textContent
                   });
                }
              }
            });
          }
          break;
        }
        
        case 'input_audio_transcription.user_speech.started':
          eventBus.emit(KatoEvents.USER_SPEECH_STARTED);
          break;
        case 'input_audio_transcription.user_speech.stopped':
          eventBus.emit(KatoEvents.USER_SPEECH_STOPPED);
          break;

        default:
          console.warn(`[XState] processAndRelayServerMessage: Unhandled server message type: ${serverMessage.type}`, serverMessage);
          // Optionally, emit a generic event for unhandled messages if useful for debugging elsewhere
          // eventBus.emit(KatoEvents.UNKNOWN_SERVER_MESSAGE, serverMessage);
          break;
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
    // Action to emit CURRENT_AGENT_CHANGED - call after currentAgentConfig is set
    emitCurrentAgentChanged: ({ context }) => {
      if (context.currentAgentConfig && context.eventBus) {
        console.log('[XState Actions] Emitting CURRENT_AGENT_CHANGED for', context.currentAgentConfig.name);
        context.eventBus.emit(KatoEvents.CURRENT_AGENT_CHANGED, {
          newAgentName: context.currentAgentConfig.name,
          oldAgentName: context.previousAgentName, // Relies on previousAgentName being set
          agentConfig: context.currentAgentConfig,
        });
      }
    },
    emitAgentSwitchStarted: ({ context }) => {
      if (context.eventBus && context.selectedAgentName) {
        console.log('[XState Actions] Emitting AGENT_SWITCH_STARTED for', context.selectedAgentName);
        context.eventBus.emit(KatoEvents.AGENT_SWITCH_STARTED, {
          newAgentName: context.selectedAgentName, // The agent we are switching TO
          oldAgentName: context.previousAgentName,    // The agent we were on
        });
      }
    },
    emitAgentSwitchCompleted: ({ context }) => {
      if (context.eventBus && context.currentAgentConfig) { // Should be currentAgentConfig for completion
        console.log('[XState Actions] Emitting AGENT_SWITCH_COMPLETED for', context.currentAgentConfig.name);
        context.eventBus.emit(KatoEvents.AGENT_SWITCH_COMPLETED, {
          agentName: context.currentAgentConfig.name,
          success: true,
        });
      }
    },
    emitAgentSwitchFailed: ({ context }) => {
      if (context.eventBus && context.selectedAgentName) { // selectedAgentName is the target of the failed switch
        console.log('[XState Actions] Emitting AGENT_SWITCH_FAILED for', context.selectedAgentName);
        context.eventBus.emit(KatoEvents.AGENT_SWITCH_FAILED, {
          agentName: context.selectedAgentName,
          success: false,
          error: context.error ? (typeof context.error === 'string' ? context.error : JSON.stringify(context.error)) : 'Unknown switch error',
        });
      }
    },
    emitPlayAgentIntroRequested: ({ context }) => {
      if (context.eventBus && context.currentAgentConfig) {
        console.log('[XState Actions] Emitting PLAY_AGENT_INTRO_REQUESTED for', context.currentAgentConfig.name);
        context.eventBus.emit(KatoEvents.PLAY_AGENT_INTRO_REQUESTED, {
          agentConfig: context.currentAgentConfig,
        });
      }
    },
    emitAgentIntroPlaybackCompleted: ({ context, event }) => {
      const output = (event as any).output as { agentName: string; success: boolean; error?: string; needsUserInteraction?: boolean };
      if (context.eventBus && output.agentName) {
        console.log('[XState Actions] Emitting AGENT_INTRO_PLAYBACK_COMPLETED (onDone) for', output.agentName);
        context.eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, {
          agentName: output.agentName,
          playedSuccessfully: output.success,
          error: output.error,
        });
      }
    },
    emitAgentIntroPlaybackFailedOnError: ({ context, event }) => {
      const errorData = (event as any).data;
      if (context.eventBus && context.currentAgentConfig) {
        console.log('[XState Actions] Emitting AGENT_INTRO_PLAYBACK_COMPLETED (onError) for', context.currentAgentConfig.name);
        context.eventBus.emit(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, {
          agentName: context.currentAgentConfig.name,
          playedSuccessfully: false,
          error: errorData instanceof Error ? errorData.message : String(errorData),
        });
      }
    },
    sendSessionUpdateOnActivation: ({ context }) => {
      const { dc, currentAgentConfig, logClientEvent, eventBus } = context;
      if (dc && dc.readyState === 'open' && currentAgentConfig) {
        const sessionUpdatePayload = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"], // Default or derive from agentConfig if available
            instructions: currentAgentConfig.instructions,
            voice: currentAgentConfig.voice || "shimmer", // Default voice if not specified
            input_audio_transcription: { model: "whisper-1" }, // Default or derive
            tools: currentAgentConfig.tools || [],
          }
        };
        try {
          dc.send(JSON.stringify(sessionUpdatePayload));
          logClientEvent(sessionUpdatePayload, "session_update_on_activation");
          console.log("[XState Actions] Sent session.update on agent activation:", sessionUpdatePayload);

          // Also clear any pending output audio buffer from a previous agent/interaction
          eventBus.emit(KatoEvents.OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED);

        } catch (error) {
          console.error("[XState Actions] Error sending session.update:", error);
        }
      } else {
        console.warn("[XState Actions] Could not send session.update: DC not open or no currentAgentConfig.", { dcState: dc?.readyState, agent: !!currentAgentConfig });
      }
    },
    // Action to emit TOOL_CALL_COMPLETED
    emitToolCallCompleted: ({ context, event }) => {
      const { eventBus } = context;
      const toolEvent = event as Extract<AgentLifecycleMachineEvent, { type: 'TOOL_EXECUTOR_SUCCESS' | 'TOOL_EXECUTOR_FAILURE' }>;
      
      if (toolEvent.type === 'TOOL_EXECUTOR_SUCCESS') {
        console.log(`[XState Actions] Emitting TOOL_CALL_COMPLETED (Success) for ${toolEvent.functionName} (${toolEvent.callId})`);
        eventBus.emit(KatoEvents.TOOL_CALL_COMPLETED, { 
          callId: toolEvent.callId, 
          functionName: toolEvent.functionName,
          success: true, 
          result: toolEvent.result 
        });
      } else if (toolEvent.type === 'TOOL_EXECUTOR_FAILURE') {
        console.log(`[XState Actions] Emitting TOOL_CALL_COMPLETED (Failure) for ${toolEvent.functionName} (${toolEvent.callId})`);
        eventBus.emit(KatoEvents.TOOL_CALL_COMPLETED, { 
          callId: toolEvent.callId,
          functionName: toolEvent.functionName,
          success: false, 
          error: toolEvent.error 
        });
      }
    },
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
                // If data channel opens, it implies any previous mic access issues might be resolved or worked around (e.g., user granted access, or connection proceeded without audio if not critical path)
                eventBus.emit(KatoEvents.MICROPHONE_ACCESS_RECOVERED);
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
                console.warn("[XState DEBUG] fetchTokenAndConnectRTC: Microphone access denied.");
                eventBus.emit(KatoEvents.UI_MODE_CHANGED, 'text');
                eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, 'no_mic');
                eventBus.emit(KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED);
                eventBus.emit(KatoEvents.MICROPHONE_ACCESS_ERROR, { error: error.message || 'Microphone access was denied.' });
              }
            reject(error); 
        }
      });
    }),
    playAgentIntro: fromPromise(async ({ input }) => {
      const currentContext = input as AgentLifecycleMachineContext;
      let { 
        currentAgentConfig,
        // audioElement, // No longer take from context for this actor
        eventBus,
        isAudioPlaybackEnabled,
        logClientEvent,
      } = currentContext;

      const agentName = currentAgentConfig?.name || 'unknown';
      console.log(`[XState Actor DEBUG] playAgentIntro: START for ${agentName}`);

      if (!currentAgentConfig || !currentAgentConfig.introAudio?.text) {
        console.log(`[XState Actor DEBUG] playAgentIntro: No intro text for ${agentName}, skipping playback.`);
        return { agentName, success: true }; 
      }

      console.log(`[XState Actor DEBUG] playAgentIntro: Preparing intro for ${agentName}`);
      logClientEvent({ agentName }, "play_intro_actor_started");

      console.log(`[XState Actor DEBUG] playAgentIntro: Creating a new Audio element for intro: ${agentName}`);
      const localAudioElement = new Audio(); // Always use a fresh Audio element for intros

      if (typeof isAudioPlaybackEnabled === 'boolean') {
        localAudioElement.autoplay = isAudioPlaybackEnabled;
      }

      let audioBlobUrl: string | null = null;

      try {
        console.log(`[XState Actor DEBUG] playAgentIntro: Fetching intro audio for ${agentName}...`);
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
          console.error(`[XState Actor DEBUG] playAgentIntro: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const audioBlob = await response.blob();
        audioBlobUrl = URL.createObjectURL(audioBlob);
        localAudioElement.src = audioBlobUrl;
        if (localAudioElement.autoplay) { 
            console.log("[XState Actor DEBUG] playAgentIntro: Attempting to honor autoplay after setting src.");
        }

        return new Promise((resolve, reject) => {
          localAudioElement.onended = () => {
            console.log(`[XState Actor DEBUG] playAgentIntro: onended triggered for ${agentName}.`);
            logClientEvent({ agentName }, "play_intro_actor_ended");
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            resolve({ agentName, success: true });
          };

          localAudioElement.onerror = (e) => {
            console.error(`[XState Actor DEBUG] playAgentIntro: onerror triggered for ${agentName}.`, e);
            logClientEvent({ agentName, error: (e instanceof ErrorEvent ? e.message : String(e)) }, "play_intro_actor_audio_error");
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            resolve({ agentName, success: false, error: "Audio playback error" }); // Still resolve, but with success:false
          };

          console.log(`[XState Actor DEBUG] playAgentIntro: Attempting to play intro for ${agentName}...`);
          localAudioElement.play()
            .then(() => {
              console.log(`[XState Actor DEBUG] playAgentIntro: Playback started for ${agentName}.`);
              logClientEvent({ agentName }, "play_intro_actor_playback_started");
            })
            .catch(playError => {
              let errorType = "Playback failed";
              let needsUserInteraction = false;
              if (playError.name === "NotAllowedError") {
                errorType = "Playback requires user interaction (NotAllowedError)";
                needsUserInteraction = true;
                console.warn(`[XState Actor DEBUG] playAgentIntro: Playback for ${agentName} requires user interaction.`);
              } else {
                console.error(`[XState Actor DEBUG] playAgentIntro: Error playing intro for ${agentName}: ${playError.message}`);
              }
              logClientEvent({ agentName, error: playError.message, name: playError.name }, "play_intro_actor_play_catch");
              if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
              resolve({ agentName, success: false, error: errorType, needsUserInteraction });
            });
        });

      } catch (error: any) {
        console.error(`[XState Actor DEBUG] playAgentIntro: Outer catch for ${agentName}: ${error.message}`);
        logClientEvent({ agentName, error: error.message }, "play_intro_actor_general_error");
        if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
        return { agentName, success: false, error: error.message, needsUserInteraction: error.name === "NotAllowedError" };
      }
    }),
    disconnectRTC: fromPromise(async ({ input }) => {
      const currentContext = input as AgentLifecycleMachineContext & { isSwitching?: boolean };
      const { pc, dc, addTranscriptBreadcrumb, logClientEvent, isSwitching } = currentContext;
      const mode = isSwitching ? "for agent switch" : "manually";
      console.log(`[XState Actor DEBUG] disconnectRTC: START (${mode})`);

      try {
        if (pc) {
          console.log(`[XState Actor DEBUG] disconnectRTC: Closing PeerConnection.`);
          const senders = pc.getSenders();
          senders.forEach((sender: RTCRtpSender) => {
            if (sender.track) {
              sender.track.stop();
            }
          });
          pc.close();
        }
        if (dc) {
          console.log(`[XState Actor DEBUG] disconnectRTC: Clearing DataChannel handlers.`);
          dc.onopen = null;
          dc.onclose = null;
          dc.onerror = null;
          dc.onmessage = null;
          // dc.close(); // pc.close() should also close the data channel.
        }
        console.log(`[XState Actor DEBUG] disconnectRTC: COMPLETED (${mode}).`);
        if (logClientEvent) {
          logClientEvent({ isSwitching }, "rtc_disconnect_actor_completed");
        }
        return Promise.resolve(); 
      } catch (error: any) {
        console.error(`[XState Actor DEBUG] disconnectRTC: ERROR (${mode}): ${error.message}`);
        if (logClientEvent) {
          logClientEvent({ error: error.message, isSwitching }, "rtc_disconnect_actor_error");
        }
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

    // Added for enhanced event emission
    previousAgentName: undefined,
    isSwitchingGlobal: false,
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
      entry: assign({
        selectedAgentName: undefined,
        currentAgentConfig: null,
        error: undefined,
        sessionStatus: 'DISCONNECTED',
        isSwitchingGlobal: false, // Reset switching flag
      }),
      on: {
        SELECT_AGENT: {
          target: 'activatingAgent', // Go directly to activating if idle
          actions: ['setSelectedAgentName', 'clearError']
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
      entry: ['clearError', assign({ isSwitchingGlobal: true }), 'emitAgentSwitchStarted', 'logBreadcrumbSwitching'],
      always: [
        { target: 'disconnectingForSwitch', guard: ({ context }) => !!context.pc },
        { target: 'activatingAgent' }, // If no pc, go straight to activating new one
      ],
    },
    disconnectingForSwitch: {
      entry: () => console.log('[XState DEBUG] Entering disconnectingForSwitch state'),
      invoke: {
        id: 'disconnectForSwitchActor',
        src: 'disconnectRTC',
        input: ({ context }) => ({ ...context, isSwitching: true }),
        onDone: {
          target: '#katoAgentLifecycle.activatingAgent',
          actions: () => console.log('[XState DEBUG] disconnectRTC actor completed (onDone)')
        },
        onError: {
          target: '#katoAgentLifecycle.switchError',
          actions: [
            () => console.error('[XState DEBUG] disconnectRTC actor errored (onError)'),
            'assignErrorFromEventData', 
            'setErrorStatus', 
            'logErrorSwitchFailed'
          ]
        }
      },
    },
    activatingAgent: {
      entry: [
        ({ context, self }) => {
          if (!context.isSwitchingGlobal) {
            console.log('[XState DEBUG] ActivatingAgent: Marking switch start internally as isSwitchingGlobal was false.');
            self.send({ type: '_INTERNAL_MARK_SWITCH_START_AND_EMIT' } as any);
          }
        },
        'findAgentConfigAction',
        // Log currentAgentConfig before emitting change
        ({context}) => console.log('[XState DEBUG] ActivatingAgent: currentAgentConfig before emitCurrentAgentChanged:', context.currentAgentConfig?.name),
        'emitCurrentAgentChanged',
        'logBreadcrumbActivating'
      ],
      on: {
        _INTERNAL_MARK_SWITCH_START_AND_EMIT: {
          actions: [assign({ isSwitchingGlobal: true }), 'emitAgentSwitchStarted']
        }
      },
      always: [
        { target: '#katoAgentLifecycle.playingIntro', guard: 'introNeededCond' },
        { target: '#katoAgentLifecycle.connecting' },
      ],
    },
    playingIntro: {
      entry: ['emitPlayAgentIntroRequested'],
      invoke: {
        id: 'playAgentIntro',
        src: 'playAgentIntro',
        input: ({context}) => context,
        onDone: [
            {
                target: '#katoAgentLifecycle.awaitingAudioModalConfirmation',
                guard: ({ event }) => (event.output as { success: boolean, needsUserInteraction?: boolean }).needsUserInteraction === true,
                actions: [
                  assign (({event}) => {
                    const output = event.output as {error?: string, needsUserInteraction?: boolean};
                    if (output.needsUserInteraction && output.error) {
                        return { error: output.error };
                    }
                    return {};
                  }),
                  'emitAgentIntroPlaybackCompleted'
                ]
            },
            {
                target: '#katoAgentLifecycle.connecting',
                guard: ({ event }) => (event.output as { success: boolean }).success, 
                actions: [
                  assign (({context, event}) => {
                    const output = event.output as {agentName: string, success: boolean};
                    if (output.success && output.agentName) {
                        const newSet = new Set(context.playedAgentIntros);
                        newSet.add(output.agentName);
                        return { playedAgentIntros: newSet };
                    }
                    return {};
                  }),
                  'emitAgentIntroPlaybackCompleted'
                ]
            },
            {
                target: '#katoAgentLifecycle.errorIntroFailed',
                actions: [
                  assign (({event}) => ({ error: (event.output as {error?: string}).error || 'Intro playback failed due to unhandled outcome' })),
                  'emitAgentIntroPlaybackCompleted'
                ]
            }
        ],
        onError: {
          target: '#katoAgentLifecycle.errorIntroFailed',
          actions: ['assignErrorFromEventData', 'emitAgentIntroPlaybackFailedOnError'],
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
      entry: [
        'setConnectedStatus',
        'assignRtcEventHandlers',
        'sendSessionUpdateOnActivation',
        'logBreadcrumbAgentActive',
        ({ context, self }) => {
          if (context.isSwitchingGlobal) {
            self.send({ type: '_INTERNAL_COMPLETE_SWITCH' } as any);
          }
        },
      ],
      onExit: ['clearRtcEventHandlers'],
      on: {
        _INTERNAL_COMPLETE_SWITCH: {
          actions: ['emitAgentSwitchCompleted', assign({ isSwitchingGlobal: false })]
        },
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
          actions: ['processAndRelayServerMessage']
        },
        AUDIO_ELEMENT_READY: {
          actions: ['assignAudioElement']
        },
        TOOL_EXECUTOR_SUCCESS: { 
          actions: ['emitToolCallCompleted']
        },
        TOOL_EXECUTOR_FAILURE: { 
          actions: ['emitToolCallCompleted'] 
        },
      },
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
      entry: ['setErrorStatus', 'logErrorSwitchFailed', 
        ({ context, self }) => {
          if (context.isSwitchingGlobal) {
            self.send({ type: '_INTERNAL_FAIL_SWITCH' } as any);
          }
        }
      ],
      on: {
        RETRY: 'preparingToSwitch',
        _INTERNAL_FAIL_SWITCH: { actions: ['emitAgentSwitchFailed', assign({isSwitchingGlobal: false})]},
      }
    },
    errorIntroFailed: {
      entry: ['setErrorStatus', 'logErrorIntroFailed',
        ({ context, self }) => { 
          if (context.isSwitchingGlobal) {
            self.send({ type: '_INTERNAL_FAIL_SWITCH' } as any);
          }
        }
      ],
      on: {
        RETRY: 'playingIntro',
        SELECT_AGENT: { target: 'preparingToSwitch', actions: ['setSelectedAgentName', 'clearError'] },
        _INTERNAL_FAIL_SWITCH: { actions: ['emitAgentSwitchFailed', assign({isSwitchingGlobal: false})]},
      },
    },
    connectionError: {
      entry: ['setErrorStatus', 'logErrorConnectionFailed',
        ({ context, self }) => {
          if (context.isSwitchingGlobal) {
            self.send({ type: '_INTERNAL_FAIL_SWITCH' } as any);
          }
        }
      ],
      on: {
        RETRY: 'connecting',
        SELECT_AGENT: { target: 'preparingToSwitch', actions: ['setSelectedAgentName', 'clearError'] },
        _INTERNAL_FAIL_SWITCH: { actions: ['emitAgentSwitchFailed', assign({isSwitchingGlobal: false})]},
      },
    }
  }
});

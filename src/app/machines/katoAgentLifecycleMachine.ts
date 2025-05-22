/**
 * This file defines the XState state machine responsible for managing the lifecycle of Kato agents
 * and the Realtime WebRTC connection.
 *
 * Core Responsibilities:
 * - Handling agent selection and switching logic.
 * - Managing the WebRTC connection states (connecting, connected, disconnected, error).
 * - Invoking actors for tasks like fetching tokens, connecting to WebRTC, playing agent intros, and disconnecting.
 * - Processing messages received from the server via the WebRTC data channel.
 * - Emitting events onto the global EventBus (`KatoEvents`) to inform other parts of the application
 *   about lifecycle changes, server messages, and errors.
 * - Listening to specific `KatoEvents` to trigger internal state transitions (e.g., user requests).
 * - Maintaining context related to the current agent, connection status, RTC peer/data channel references, etc.
 *
 * When this machine is used:
 * - It should be instantiated and started early in the application lifecycle (e.g., in `App.tsx`).
 * - UI components and services interact with this machine primarily by sending it events (defined in its `events` type)
 *   or by listening to events it emits on the global EventBus.
 * - It centralizes the complex state logic associated with agent interaction and realtime communication,
 *   promoting a clear separation of concerns and a predictable state management model.
 */

// Declare global interface for transcript items
declare global {
  interface Window {
    __TRANSCRIPT_ITEMS__?: any[];
  }
}

import { setup, createMachine, assign, fromPromise, sendTo, ActorRef } from 'xstate';
import { AgentConfig } from '@/app/types';
import { EventBus } from '@/app/lib/eventBus'; // Assuming path
import { createRealtimeConnection, setMicrophoneEnabled, setAudioOutputEnabled } from '@/app/lib/realtimeConnection'; // Assuming path
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
  // Rename and keep optional for settings inputs
  micEnabled?: boolean;
  audioOutputEnabled?: boolean;
  pushToTalk?: boolean;
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

  // Settings
  micEnabled?: boolean;
  audioOutputEnabled?: boolean;
  pushToTalk?: boolean;
  justSkippedIntro?: boolean;
  lastReconnectionTime: number;
  isAudioModeChangeInProgress: boolean;
  
  // Add the currentReconnectAttempt to fix the linter error
  currentReconnectAttempt?: number;
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
  | { type: '_RTC_SERVER_REPORTED_ERROR'; errorDetails: any }
  // Tool execution feedback events (from tool executor to machine)
  | { type: 'TOOL_EXECUTOR_SUCCESS'; callId: string; functionName: string; result: any }
  | { type: 'TOOL_EXECUTOR_FAILURE'; callId: string; functionName: string; error: any }
  | { type: 'USER_UPDATED_SETTINGS'; micEnabled: boolean; audioOutputEnabled: boolean; pushToTalk: boolean }
  | { type: 'SETTING_MIC_ENABLED'; value: boolean }
  | { type: 'SETTING_AUDIO_OUTPUT_ENABLED'; value: boolean }
  | { type: 'SETTING_PUSH_TO_TALK'; value: boolean };

type SpecificEvent<T extends AgentLifecycleMachineEvent['type']> = Extract<AgentLifecycleMachineEvent, { type: T }>;

// Define a new type for events that can be sent within the machine
type MachineInternalEvent = 
  | { type: 'NO_OP' } // Add any other internal event types here
  | AgentLifecycleMachineEvent;

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
            if (serverMessage.type === 'error') {
              console.error('[XState] Server sent error message:', serverMessage.error);
              self.send({ type: '_RTC_SERVER_REPORTED_ERROR', errorDetails: serverMessage });
            } else if (serverMessage.type === 'session.transfer_agent.request' && serverMessage.agent_name) {
              console.log('[XState] Detected agent transfer request:', serverMessage.agent_name);
              self.send({ type: 'SERVER_REQUESTED_AGENT_TRANSFER', agentName: serverMessage.agent_name });
            } else {
              self.send({ type: 'RTC_SERVER_MESSAGE_RECEIVED', serverMessage });
            }
          } catch (e) {
            console.error("[XState] Error parsing server message:", e);
            // Optionally send a general parsing error to the machine
            self.send({ type: 'RTC_CONNECTION_FAILED', error: 'Failed to parse server message' });
          }
        };
        dc.onclose = () => {
          console.log("[XState DEBUG] fetchTokenAndConnectRTC: Data channel closed unexpectedly during setup phase.");
          self.send({ type: 'RTC_DISCONNECTED', reason: 'dc_closed' });
        };
        dc.onerror = (event: Event) => {
          console.error("[XState DEBUG] fetchTokenAndConnectRTC: Data channel error during setup.", event);
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

      // Log the raw server message before processing (except for audio_transcript.delta, response.text.delta which is noisy)
      logServerEvent(serverMessage, `machine_processing_${serverMessage.type}`);
      if (serverMessage.type !== 'response.audio_transcript.delta' && serverMessage.type !== 'response.text.delta') {
        console.log(`[XState] processAndRelayServerMessage: Processing type '${serverMessage.type}'`, serverMessage);
      }

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

        case 'session.updated':
          console.log('[XState] Received session.updated event:', serverMessage);
          addTranscriptBreadcrumb('Session settings confirmed/updated by server.');
          eventBus.emit(KatoEvents.SERVER_SESSION_UPDATED_ACK, { serverMessage });
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[XState] Received input_audio_buffer.speech_started event:', serverMessage);
          addTranscriptBreadcrumb('Server detected audio input buffer speech started.');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[XState] Received input_audio_buffer.speech_stopped event:', serverMessage);
          addTranscriptBreadcrumb('Server detected audio input buffer speech stopped.');
          break;

        case 'input_audio_buffer.committed':
          console.log('[XState] Received input_audio_buffer.committed event:', serverMessage);
          addTranscriptBreadcrumb('Server confirmed audio input buffer committed.');
          // This event is important, especially in PTT scenarios or when VAD is off.
          // It might signal that a user's audio segment is fully processed for input.
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
          const previousItemId = serverMessage.item?.previous_item_id;
          
          // For user messages coming from the server, use the current agent name
          // For assistant messages, always use the current agent name
          // This ensures both sides of conversation are assigned to correct agent
          const agentName = context.currentAgentConfig?.name;

          if (firstContent) {
            if (firstContent.type === 'text') textContent = firstContent.text;
            else if (firstContent.type === 'input_text') textContent = firstContent.text;
            else if (firstContent.type === 'audio') textContent = firstContent.transcript;
            else if (role === 'user' && !textContent) textContent = "[Processing...]";
          } else if (role === 'user') {
            textContent = "[Processing user input...]";
          } else if (role === 'assistant') {
            // For assistant messages with no content, use a role-specific placeholder
            // This will be updated when the final content arrives
            textContent = "[Assistant is responding...]";
          }
          
          // Ensure textContent is not undefined
          if (textContent === undefined || textContent === null) {
            console.warn(`[XState] Warning: Empty text content for ${role} message with id ${itemId}`);
            textContent = role === 'assistant' ? `[Assistant is responding...]` : `[${role} message]`;
          }
          
          if (itemId && role) {
            console.log(`[XState] Conversation item created: ${role} message with agent ${agentName || 'unknown'}`);
            console.log(`[XState] Message text content: "${textContent?.substring(0, 50)}${textContent && textContent.length > 50 ? '...' : ''}"`);
            
            eventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, { 
              itemId, 
              role, 
              text: textContent || "",
              previousItemId, // Pass previous_item_id for ordering
              agentName // Always associate with current agent for proper grouping
            });
          } else {
            console.warn('[XState] Malformed conversation.item.created:', serverMessage);
          }
          break;
        }

        case 'conversation.item.input_audio_transcription.delta': {
          const itemId = serverMessage.item_id;
          const deltaText = serverMessage.delta;
          if (itemId && typeof deltaText === 'string') {
            eventBus.emit(KatoEvents.SERVER_USER_TRANSCRIPT_DELTA, { itemId, deltaText });
          } else {
            console.warn('[XState] Malformed conversation.item.input_audio_transcription.delta:', serverMessage);
          }
          break;
        }

        case 'conversation.item.input_audio_transcription.completed':
          if (serverMessage.item_id && typeof serverMessage.transcript === 'string') {
            eventBus.emit(KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED, { 
              itemId: serverMessage.item_id, 
              transcript: serverMessage.transcript 
            });
            // Only explicitly request a response if in push-to-talk mode.
            // In conversation mode with create_response:true, OpenAI handles this automatically.
            if (context.pushToTalk) {
              eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
                eventObj: { type: "response.create" },
                eventNameSuffix: "response_create_after_user_transcript_completed_ptt_xstate_machine"
              });
            }
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

        case 'response.created':
          console.log('[XState] Received response.created event:', serverMessage);
          addTranscriptBreadcrumb('Server started creating a response.');
          // Potential: emit KatoEvents.AGENT_RESPONSE_STARTED if UI needs to show a thinking state.
          // const responseId = serverMessage.response?.id;
          // if (responseId) eventBus.emit(KatoEvents.AGENT_RESPONSE_ID_RECEIVED, { responseId });
          break;

        case 'response.output_item.added':
          console.log('[XState] Received response.output_item.added event:', serverMessage);
          addTranscriptBreadcrumb('Server added an output item to the response.');
          // const itemId = serverMessage.item?.id;
          // const itemType = serverMessage.item?.type; // e.g., 'message', 'function_call'
          // Useful for pre-initializing UI elements for incoming response items.
          break;

        case 'response.content_part.added':
          console.log('[XState] Received response.content_part.added event:', serverMessage);
          // This is granular. Might be useful for complex multi-modal content.
          // addTranscriptBreadcrumb('Server added a content part to an output item.');
          break;

        case 'response.audio.done':
          console.log('[XState] Received response.audio.done event:', serverMessage);
          addTranscriptBreadcrumb('Server finished generating audio for a response item.');
          // const itemId = serverMessage.item_id;
          // Could be used to enable UI like "replay audio" once full server-side generation is confirmed.
          break;

        case 'response.audio_transcript.done':
          console.log('[XState] Received response.audio_transcript.done event:', serverMessage);
          addTranscriptBreadcrumb('Server finished transcribing audio for a response item.');
          // const itemId = serverMessage.item_id;
          // const transcript = serverMessage.transcript;
          // This might be useful if you need the final transcript of the agent's speech separately.
          break;

        case 'response.content_part.done':
          console.log('[XState] Received response.content_part.done event:', serverMessage);
          // addTranscriptBreadcrumb('Server completed a content part of an output item.');
          // This is very granular, logging is likely sufficient unless specific UI updates are tied to it.
          break;

        case 'rate_limits.updated':
          console.log('[XState] Received rate_limits.updated event:', serverMessage);
          addTranscriptBreadcrumb('Server provided rate limit update.');
          // Useful for monitoring. Could potentially parse serverMessage.rate_limits for specific limits.
          break;
        case 'response.text.delta':
          // show streaming text as it comes in
          break;
        case 'response.text.done':
          // text response is complete
          break;

        default:
          console.warn(`[XState] processAndRelayServerMessage: Unhandled server message type: ${serverMessage.type}`, serverMessage);
          // Optionally, emit a generic event for unhandled messages if useful for debugging elsewhere
          // eventBus.emit(KatoEvents.UNKNOWN_SERVER_MESSAGE, serverMessage);
          break;
      }
    },
    assignAudioElement: assign({
      audioElement: ({ event }) => (event as SpecificEvent<'AUDIO_ELEMENT_READY'>).audioElement
    }),
    sendSimulatedMessageOnSwitchAction: ({ context }) => {
      if (context.justSkippedIntro && context.currentAgentConfig) {
        console.log(`[XState] Agent ${context.currentAgentConfig.name} activated after switch, sending simulated message.`);
        context.eventBus.emit(KatoEvents.SEND_MESSAGE_TO_SERVER, {
          eventObj: {
            type: "conversation.user_request", 
            payload: {
              text: `User re-engaged with ${context.currentAgentConfig.name}.`,
              is_simulated: true
            }
          },
          eventNameSuffix: "simulated_agent_engagement_after_switch"
        });
      }
    },
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
      const { dc, currentAgentConfig, logClientEvent, eventBus, isAudioPlaybackEnabled, pushToTalk } = context;
      if (dc && dc.readyState === 'open' && currentAgentConfig) {
        const modalities = isAudioPlaybackEnabled ? ["text", "audio"] : ["text"];
        
        let turnDetectionSettings: any = null;
        // If pushToTalk is false (i.e., conversation mode), enable server-side VAD.
        // Otherwise, turn_detection remains null (PTT mode, or no mic).
        if (pushToTalk === false) {
          turnDetectionSettings = {
            type: "server_vad", 
            threshold: 0.5, 
            prefix_padding_ms: 300,
            silence_duration_ms: 500, // 500ms of silence to detect end of user speech
            create_response: true, // Important: Server waits for user speech before responding
          };
        }

        // Step 1: Send the session.update to configure the agent with new settings
        const sessionUpdatePayload = {
          type: "session.update",
          session: {
            modalities: modalities,
            instructions: currentAgentConfig.instructions,
            voice: currentAgentConfig.voice || "shimmer",
            input_audio_transcription: { model: "whisper-1" }, 
            tools: currentAgentConfig.tools || [],
            turn_detection: turnDetectionSettings, // Add VAD settings here
          }
        };
        try {
          dc.send(JSON.stringify(sessionUpdatePayload));
          logClientEvent(sessionUpdatePayload, "session_update_on_activation");
          console.log("[XState Actions] Sent session.update on agent activation:", sessionUpdatePayload);

          // Step 2: After session update, send the conversation history if switching agents
          if (context.previousAgentName && context.previousAgentName !== currentAgentConfig.name) {
            console.log(`[XState Actions] Agent switch detected: ${context.previousAgentName} -> ${currentAgentConfig.name}`);
            
            // First, check for agent-specific conversation context
            let agentMessages: any[] = [];
            
            if (typeof window !== 'undefined' && window.__AGENT_CONVERSATION_CONTEXTS__) {
              const agentContexts = window.__AGENT_CONVERSATION_CONTEXTS__;
              const agentName = currentAgentConfig.name;
              
              if (agentContexts[agentName] && agentContexts[agentName].length > 0) {
                console.log(`[XState Actions] Found agent-specific context for ${agentName} with ${agentContexts[agentName].length} messages`);
                agentMessages = agentContexts[agentName];
              } else {
                console.log(`[XState Actions] No agent-specific context found for ${agentName}, using filtered transcript items`);
                
                // Fallback to the global transcript items
                if (window.__TRANSCRIPT_ITEMS__) {
                  const transcriptItems = window.__TRANSCRIPT_ITEMS__;
                  
                  // Filter messages to only include ones for this agent
                  agentMessages = transcriptItems.filter((item: any) => {
                    return (
                      item.type === 'MESSAGE' && 
                      !item.isHidden &&
                      ((item.role === 'assistant' && item.agentName === currentAgentConfig.name) ||
                       (item.role === 'user' && item.agentName === currentAgentConfig.name))
                    );
                  });
                  
                  console.log(`[XState Actions] Filtered ${transcriptItems.length} transcript items to ${agentMessages.length} messages for agent ${currentAgentConfig.name}`);
                }
              }
            }
            
            // Log the agent messages we're about to send
            console.log(`[XState Actions] Preparing to send ${agentMessages.length} messages for agent ${currentAgentConfig.name}`);
            
            // Send messages in chronological order
            let msgCount = 0;
            for (const item of agentMessages) {
              msgCount++;
              
              // Ensure item has a title for display
              if (!item.title || item.title === '') {
                console.warn(`[XState Actions] Message ${msgCount} has empty title. Using placeholder for display.`);
                item.title = `[Message content unavailable]`;
              }
              
              const messageContent = item.role === 'user' ? 
                { type: "input_text", text: item.title || "" } :
                { type: "text", text: item.title || "" };
              
              const conversationItem = {
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: item.role,
                  content: [messageContent]
                }
              };
              
              try {
                // Send each message to rebuild conversation history
                dc.send(JSON.stringify(conversationItem));
                console.log(`[XState Actions] Sent message ${msgCount}/${agentMessages.length} (${item.role}) to rebuild context for ${currentAgentConfig.name}`);
              } catch (e) {
                console.error(`[XState Actions] Error sending conversation item ${msgCount}:`, e);
              }
            }
            
            if (msgCount > 0) {
              console.log(`[XState Actions] Successfully sent ${msgCount} messages to rebuild conversation context for ${currentAgentConfig.name}`);
            } else {
              console.log(`[XState Actions] No messages sent for ${currentAgentConfig.name} (empty context)`);
            }
          } else {
            if (context.previousAgentName === currentAgentConfig.name) {
              console.log(`[XState Actions] No agent switch detected (still ${currentAgentConfig.name}), skipping context transfer`);
            } else {
              console.log(`[XState Actions] Initial agent activation for ${currentAgentConfig.name}, no previous context to transfer`);
            }
          }

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
    // New action to send "Hi" if intro was skipped
    sendSimulatedHiIfIntroSkipped: ({ context }) => {
      if (context.justSkippedIntro && context.dc && context.dc.readyState === 'open' && context.currentAgentConfig) {
        console.log(`[XState Actions] Intro was skipped for ${context.currentAgentConfig.name}. Sending simulated 'Hi'.`);
        const userHiMessage = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hi" }],
          },
        };
        const createResponseMessage = {
          type: "response.create"
        };

        try {
          context.dc.send(JSON.stringify(userHiMessage));
          context.dc.send(JSON.stringify(createResponseMessage));
          context.logClientEvent(userHiMessage, 'simulated_user_hi');
          context.logClientEvent(createResponseMessage, 'simulated_response_create');
        } catch (e) {
          console.error("[XState Actions] Error sending simulated 'Hi' message:", e);
        }
        // The flag is reset when activatingAgent is re-entered.
      }
    },
    // Actions to update settings in context
    assignMicEnabled: assign(({
      context,
      event
    }) => {
      const newValue = (event as SpecificEvent<'SETTING_MIC_ENABLED'>).value;
      if (context.micEnabled !== newValue) {
        if (context.pc) {
          setMicrophoneEnabled(context.pc, newValue); // Pass context.pc
        } else {
          console.warn('[XState] Cannot set microphone enabled: PeerConnection (pc) is not available in context.');
        }
        context.eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, { mode: newValue && !context.pushToTalk ? 'conversation' : (newValue && context.pushToTalk ? 'ptt' : 'no_mic')});
        context.addTranscriptBreadcrumb(`Microphone ${newValue ? 'enabled' : 'disabled'}.`);
        return { micEnabled: newValue };
      }
      return {};
    }),
    assignAudioOutputEnabled: assign(({
      context,
      event
    }) => {
      const newValue = (event as SpecificEvent<'SETTING_AUDIO_OUTPUT_ENABLED'>).value;
      if (context.audioOutputEnabled !== newValue) {
        // Side effect handled by speak/page.tsx listening to AUDIO_PLAYBACK_ENABLED_CHANGED
        context.eventBus.emit(KatoEvents.AUDIO_PLAYBACK_ENABLED_CHANGED, newValue);
        context.addTranscriptBreadcrumb(`Audio output ${newValue ? 'enabled' : 'disabled'}.`);
        return { audioOutputEnabled: newValue, isAudioPlaybackEnabled: newValue };
      }
      return {};
    }),
    assignPushToTalk: assign(({
      context,
      event
    }) => {
      const newValue = (event as SpecificEvent<'SETTING_PUSH_TO_TALK'>).value;
      if (context.pushToTalk !== newValue) {
        context.eventBus.emit(KatoEvents.AUDIO_INPUT_MODE_CHANGED, { mode: context.micEnabled && !newValue ? 'conversation' : (context.micEnabled && newValue ? 'ptt' : 'no_mic')});
        context.addTranscriptBreadcrumb(`Push-to-talk ${newValue ? 'enabled' : 'disabled'}.`);
        return { pushToTalk: newValue };
      }
      return {};
    }),
    logAudioPlaybackEnabledChanged: ({ event }: { event: any }) => {
      if (typeof event.value === 'boolean') {
        console.log(`[XState] Audio playback ${event.value ? 'enabled' : 'disabled'}`);
      }
    },
    logReconnectingForAudioModeChange: ({ context }: { context: AgentLifecycleMachineContext }) => {
      console.log(`[XState] Reconnecting due to audio mode change: ${context.isAudioPlaybackEnabled ? 'speak' : 'write'} mode`);
    },
    logDisconnectedForAudioModeChange: () => {
      console.log('[XState] Disconnected for audio mode change, preparing to reconnect');
    },
    logWaitCompleteForAudioModeChange: () => {
      console.log('[XState] Wait complete, selecting agent after audio mode change');
    },
    logErrorReconnectingAudioMode: ({ event }: { event: any }) => {
      if (event && event.data) {
        console.error('[XState] Error reconnecting after audio mode change:', event.data);
      } else {
        console.error('[XState] Error reconnecting after audio mode change: Unknown error');
      }
    },
    updateEventBusAudioPlaybackEnabled: ({ context, event }: { context: AgentLifecycleMachineContext; event: any }) => {
      if (context.eventBus && typeof event.value === 'boolean') {
        context.eventBus.emit('kato_event_audio_playback_enabled_changed', event.value);
      }
    },
    // Add a new action to handle agent selection
    sendSelectAgentAction: ({ context, self }) => {
      if (context.previousAgentName) {
        self.send({ 
          type: 'SELECT_AGENT', 
          agentName: context.previousAgentName 
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

            const { pc, dc } = await createRealtimeConnection(EPHEMERAL_KEY, tempAudioElementRef, urlCodec, isAudioPlaybackEnabled);
            
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
      const localAudioElement = new Audio(); 

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
          // No need to revokeObjectURL here as it's not created yet
          return { agentName, success: false, error: errorMsg }; // Resolve promise directly on fetch error
        }

        const audioBlob = await response.blob();
        audioBlobUrl = URL.createObjectURL(audioBlob);
        
        return new Promise((resolve) => { 
          let hasResolved = false; // Flag to prevent multiple resolves
          const timeoutDuration = 10000; // 10 seconds

          const resolveOnce = (value: any) => {
            if (!hasResolved) {
              hasResolved = true;
              clearTimeout(playbackTimeoutId);
              if (audioBlobUrl && value.success === false) { // Also revoke if we are resolving with error
                  URL.revokeObjectURL(audioBlobUrl);
              } else if (value.success === true && value.revokedAlready !== true) {
                 // if success, onended will revoke. If we time out and treat as success (e.g. audio disabled), revoke here.
              }
              resolve(value);
            }
          };
          
          const playbackTimeoutId = setTimeout(() => {
            if (!hasResolved) {
              console.error(`[XState Actor DEBUG] playAgentIntro: TIMEOUT for ${agentName} - oncanplaythrough or onended not triggered within ${timeoutDuration}ms.`);
              logClientEvent({ agentName, error: "Playback timeout" }, "play_intro_actor_timeout");
              // No URL.revokeObjectURL here, let resolveOnce handle it
              resolveOnce({ agentName, success: false, error: "Playback timeout", revokedAlready: audioBlobUrl ? false : true });
            }
          }, timeoutDuration);

          localAudioElement.onended = () => {
            if (hasResolved) return;
            console.log(`[XState Actor DEBUG] playAgentIntro: onended triggered for ${agentName}.`);
            logClientEvent({ agentName }, "play_intro_actor_ended");
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            resolveOnce({ agentName, success: true, revokedAlready: true });
          };

          localAudioElement.onerror = (e) => {
            if (hasResolved) return;
            const errorMessage = (e instanceof ErrorEvent) ? e.message : 
                                 (e instanceof Event && e.target && (e.target as HTMLAudioElement).error) ? (e.target as HTMLAudioElement).error?.message : 
                                 'Unknown audio element error';
            console.error(`[XState Actor DEBUG] playAgentIntro: localAudioElement.onerror triggered for ${agentName}. Error: ${errorMessage}`, e);
            logClientEvent({ agentName, error: errorMessage }, "play_intro_actor_audio_element_error");
            // No URL.revokeObjectURL here, let resolveOnce handle it
            resolveOnce({ agentName, success: false, error: errorMessage, revokedAlready: audioBlobUrl ? false : true });
          };

          localAudioElement.oncanplaythrough = () => {
            if (hasResolved) return;
            console.log(`[XState Actor DEBUG] playAgentIntro: oncanplaythrough triggered for ${agentName}. Attempting to play.`);
            if (isAudioPlaybackEnabled) {
              localAudioElement.play()
                .then(() => {
                  console.log(`[XState Actor DEBUG] playAgentIntro: Playback started successfully for ${agentName}.`);
                  logClientEvent({ agentName }, "play_intro_actor_playback_started");
                  // 'onended' will handle successful resolution. Timeout still active.
                })
                .catch(playError => {
                  if (hasResolved) return;
                  let errorType = "Playback failed";
                  let needsUserInteraction = false;
                  if (playError instanceof Error) {
                    if (playError.name === "NotAllowedError") {
                      errorType = "Playback requires user interaction (NotAllowedError)";
                      needsUserInteraction = true;
                      console.warn(`[XState Actor DEBUG] playAgentIntro: Playback for ${agentName} requires user interaction. Name: ${playError.name}, Message: ${playError.message}`);
                    } else {
                      console.error(`[XState Actor DEBUG] playAgentIntro: Error playing intro for ${agentName}. Name: ${playError.name}, Message: ${playError.message}`);
                    }
                    logClientEvent({ agentName, error: playError.message, name: playError.name }, "play_intro_actor_play_catch");
                  } else {
                     console.error(`[XState Actor DEBUG] playAgentIntro: Non-Error object caught during play for ${agentName}:`, playError);
                     logClientEvent({ agentName, error: String(playError), name: "UnknownPlayError" }, "play_intro_actor_play_catch_non_error");
                  }
                  // No URL.revokeObjectURL here, let resolveOnce handle it
                  resolveOnce({ agentName, success: false, error: errorType, needsUserInteraction, revokedAlready: audioBlobUrl ? false : true });
                });
            } else {
              console.log(`[XState Actor DEBUG] playAgentIntro: Audio playback is disabled for ${agentName}, not playing after canplaythrough.`);
              // No URL.revokeObjectURL here, let resolveOnce handle it
              resolveOnce({ agentName, success: true, revokedAlready: audioBlobUrl ? false : true }); // Success because playback was intentionally skipped
            }
          };
          
          console.log(`[XState Actor DEBUG] playAgentIntro: Setting src for ${agentName}: ${audioBlobUrl}`);
          if (audioBlobUrl) { 
            localAudioElement.src = audioBlobUrl;
            console.log(`[XState Actor DEBUG] playAgentIntro: src for ${agentName} has been set. Waiting for events...`);
          } else {
            console.error(`[XState Actor DEBUG] playAgentIntro: audioBlobUrl is null when trying to set src for ${agentName}. This indicates a fetch issue not caught earlier.`);
            // No URL.revokeObjectURL here, let resolveOnce handle it
            resolveOnce({ agentName, success: false, error: "audioBlobUrl was null before setting src", revokedAlready: true });
          }
        });

      } catch (error: any) { // This catch is for the fetch operation mainly
        console.error(`[XState Actor DEBUG] playAgentIntro: Outer catch for ${agentName} (likely fetch error): ${error.message}`, error);
        logClientEvent({ agentName, error: error.message, name: error.name }, "play_intro_actor_general_error");
        if (audioBlobUrl) { // Should be null if fetch failed, but good practice
          URL.revokeObjectURL(audioBlobUrl);
        }
        const needsInteraction = error.name === "NotAllowedError"; // Unlikely for fetch, but for completeness
        return { agentName, success: false, error: error.message, needsUserInteraction: needsInteraction };
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
    },
    shouldDebounceReconnection: ({ context }: { context: AgentLifecycleMachineContext }) => {
      const now = Date.now();
      const timeSinceLastReconnection = now - context.lastReconnectionTime;
      const DEBOUNCE_TIME = 2000; // 2 seconds
      
      console.log(`[XState Guard] shouldDebounceReconnection: timeSince=${timeSinceLastReconnection}ms, threshold=${DEBOUNCE_TIME}ms`);
      
      return timeSinceLastReconnection < DEBOUNCE_TIME;
    },
    shouldReconnectForAudioModeChange: ({ context, event }: { context: AgentLifecycleMachineContext; event: any }) => {
      if (typeof event.value !== 'boolean') return false;
      
      // Only reconnect if audio mode actually changed and we're connected
      const audioModeChanged = context.isAudioPlaybackEnabled !== event.value;
      const isConnected = context.sessionStatus === 'CONNECTED';
      
      console.log(`[XState Guard] shouldReconnectForAudioModeChange: audioModeChanged=${audioModeChanged}, isConnected=${isConnected}`);
      
      return audioModeChanged && isConnected;
    }
  },
}).createMachine({
  id: 'katoAgentLifecycle',
  initial: 'idle',
  context: ({ input }: { input: AgentLifecycleMachineInput }) => ({
    // Spread the input from useMachine
    ...input,
    // Default values for other context fields
    selectedAgentName: undefined,
    currentAgentConfig: null,
    error: undefined,
    playedAgentIntros: new Set<string>(),
    sessionStatus: 'DISCONNECTED' as const,
    pc: null,
    dc: null,
    previousAgentName: undefined,
    isSwitchingGlobal: false,
    justSkippedIntro: false,
    // ---SETTINGS DEFAULTS---
    micEnabled: true,
    audioOutputEnabled: true,
    pushToTalk: false, // Default to conversation mode as per requirement
    lastReconnectionTime: 0,
    isAudioModeChangeInProgress: false,
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
    },
    USER_UPDATED_SETTINGS: {
      actions: [
        assign(({ context, event }) => {
          // Toggle microphone if session is active
          if (context.pc && typeof event.micEnabled === 'boolean') {
            setMicrophoneEnabled(context.pc, event.micEnabled);
          }
          // Toggle speaker if audio element is available
          if (context.audioElement && typeof event.audioOutputEnabled === 'boolean') {
            setAudioOutputEnabled(context.audioElement, event.audioOutputEnabled);
          }
          // Emit AUDIO_INPUT_MODE_CHANGED if pushToTalk changes
          if (context.eventBus && typeof event.pushToTalk === 'boolean') {
            context.eventBus.emit(
              KatoEvents.AUDIO_INPUT_MODE_CHANGED,
              event.pushToTalk ? 'ptt' : 'conversation'
            );
          }
          return {
            micEnabled: event.micEnabled,
            audioOutputEnabled: event.audioOutputEnabled,
            pushToTalk: event.pushToTalk,
          };
        })
      ],
    },
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
        ({context}) => console.log('[XState DEBUG] ActivatingAgent: currentAgentConfig before emitCurrentAgentChanged:', context.currentAgentConfig?.name),
        'emitCurrentAgentChanged',
        'logBreadcrumbActivating',
        assign({
          justSkippedIntro: ({ context }) => {
            const agentConfig = context.currentAgentConfig;
            // If no agent or no intro text, consider intro skipped.
            if (!agentConfig || !agentConfig.introAudio?.text) return true; 
            // Otherwise, skipped if already played.
            return context.playedAgentIntros.has(agentConfig.name); 
          }
        })
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
        'sendSimulatedHiIfIntroSkipped',
        assign({ justSkippedIntro: false }),
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
        _RTC_SERVER_REPORTED_ERROR: { // Handler for server-sent errors
          target: '#katoAgentLifecycle.connectionError',
          actions: [
            assign({ error: ({ event }) => event.errorDetails }),
            'setErrorStatus',
            ({context, event}) => {
              const errorDetails = (event as any).errorDetails;
              console.error(`[XState] Transitioning to connectionError due to server-reported error:`, errorDetails);
              context.addTranscriptBreadcrumb(`Session failed: Server error - ${JSON.stringify(errorDetails.error)}`);
              if (context.eventBus && errorDetails) {
                context.eventBus.emit(KatoEvents.SERVER_SESSION_ERROR, { error: errorDetails });
              }
            },
            'clearRtcRefs' 
          ]
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
    },
    reconnectingForAudioModeChange: {
      entry: [
        ({ context }) => console.log(`[XState] Reconnecting due to audio mode change: ${context.isAudioPlaybackEnabled ? 'speak' : 'write'} mode`),
        assign({
          previousAgentName: ({ context }) => context.currentAgentConfig?.name || undefined
        })
      ],
      invoke: {
        src: 'disconnectRTC',
        input: ({ context }) => ({ ...context, isSwitching: false }),
        onDone: {
          target: 'idle',
          actions: [
            ({ context }) => console.log('[XState] Disconnected for audio mode change, reconnecting via idle state'),
            // Instead of trying to send events directly, we'll set this up so the
            // idle state can handle it when we transition there
            assign({
              selectedAgentName: ({ context }) => context.previousAgentName
            })
          ]
        },
        onError: {
          target: 'connectionError',
          actions: [
            ({ context, event }) => console.error('[XState] Error during reconnection:', event),
            assign({
              error: ({ event }) => {
                // Handle error in a safe way
                return event.error || 'Unknown error during reconnection';
              },
              sessionStatus: 'ERROR' as const
            })
          ]
        }
      }
    },
    errorReconnectingAudioMode: {
      entry: [
        'logErrorReconnectingAudioMode',
        assign({
          sessionStatus: 'ERROR',
          isAudioModeChangeInProgress: false
        })
      ],
      on: {
        RETRY: 'idle'
      }
    }
  }
});

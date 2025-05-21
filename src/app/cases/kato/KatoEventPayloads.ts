import { AgentConfig, SessionStatus } from '@/app/types'; // Corrected import paths
// import { TranscriptItem } from '@/app/types'; // Assuming TranscriptItem type path - commented out as it's not fully defined yet.

// User Intents Payloads
export interface UserRequestedDisconnectPayload {
  isSwitchingAgent?: boolean;
}

export interface UserSentTextMessagePayload {
  text: string;
  id: string;
}

export interface UserSelectedAgentPayload {
  agentName: string;
}

export interface UserToggledAudioPlaybackPayload {
  enabled: boolean;
}

export interface UserRequestedUiModeChangePayload {
  mode: 'avatar' | 'text';
}

export interface UserRequestedAudioInputModeChangePayload {
  mode: 'conversation' | 'ptt' | 'no_mic';
}

export interface UserRequestedMicrophoneAccessPayload {
  requestType: 'initial' | 'retry'; // e.g. initial request vs. retry after denial
}

// Application/System Event Payloads
export interface SessionStatusWillChangePayload {
  newStatus: SessionStatus;
}

export interface SessionStatusChangedPayload {
  status: SessionStatus;
}

export interface DataChannelStatusChangedPayload {
  status: 'open' | 'closed' | 'error';
}

export interface ConnectionFailedPayload {
  error: Error;
}

export interface IntroAudioStateChangedPayload {
  playing: boolean;
  error?: string;
  reason?: string;
  isRetryAfterModal?: boolean;
}

export interface AudioModalVisibilityChangedPayload {
  isVisible: boolean;
}

export interface ActiveSpeakerTurnChangedPayload {
  speaker: 'user' | 'patient' | 'preceptor' | 'none'; // Assuming 'patient' and 'preceptor' are for specific agent contexts
}

export interface AgentConfigurationLoadedPayload {
  configs: AgentConfig[];
}

export interface CurrentAgentChangedPayload {
  newAgentName: string;
  oldAgentName?: string;
  agentConfig?: AgentConfig;
}

export interface UiModeChangedPayload {
  mode: 'avatar' | 'text';
}

export interface PttActiveChangedPayload {
  isActive: boolean;
}

export interface PttUserSpeakingChangedPayload {
  isSpeaking: boolean;
}

export interface AudioPlaybackEnabledChangedPayload {
  enabled: boolean;
}

export interface OutputAudioBufferStatusChangedPayload {
  isActive: boolean;
}

export interface AudioInputModeChangedPayload {
  mode: 'conversation' | 'ptt' | 'no_mic';
}

export interface MicrophoneAccessErrorPayload {
  error?: string;
}

// Server-Driven Event Payloads
export interface ServerMessageReceivedPayload {
  message: any; // Raw server message, consider defining further if structure is known
}

export interface ServerSessionStatusUpdatePayload {
  status: SessionStatus;
}

// Assuming a base TranscriptItem type exists or will be created in @/app/types
// For now, define a placeholder or inline structure if TranscriptItem is not yet available.
export interface ServerTranscriptItemPayload {
  // Omit<TranscriptItem, 'id'> & { serverId?: string, idToAssign: string, status?: string }
  // Placeholder structure:
  role: 'user' | 'assistant' | 'system'; // Example roles
  content: string;
  timestamp: number;
  serverId?: string;
  idToAssign: string;
  status?: string; // e.g., 'interim', 'final', 'failed'
  finalText?: string; 
}

export interface ServerSessionCreatedPayload {
  sessionId: string;
}

export interface ServerTranscriptItemCreatedPayload {
  itemId: string;
  role: 'user' | 'assistant'; // From task description, adjust if KatoEvents.ts is more accurate
  text: string; // Changed back from initialText
  timestamp?: number; // Added based on task description example
  isHidden?: boolean; // Added to align with context usage
  previousItemId?: string; // Add previous_item_id for ordering
  agentName?: string; // Add agentName to associate with specific agent
}

export interface ServerUserTranscriptCompletedPayload {
  itemId: string;
  transcript: string;
}

export interface ServerUserTranscriptDeltaPayload {
  itemId: string;
  deltaText: string;
}

export interface ServerAssistantDeltaReceivedPayload {
  itemId: string;
  deltaText: string;
}

export interface ServerAssistantMessageCompletedPayload {
  itemId: string;
  fullText: string;
}

export interface ServerFunctionCallRequestedPayload {
  callId?: string;
  functionName: string;
  argsString: string; // Consider parsing if possible: args: Record<string, any>
}

export interface ServerTranscriptItemStatusUpdatePayload {
  itemId: string;
  status: string; // e.g., 'processing', 'completed', 'failed'
  finalText?: string;
}

// Client-Side Event Payloads (to server or internal)
export interface SendMessageToServerPayload {
  eventObj: any; // The actual message/event to send
  eventNameSuffix?: string;
}

export interface SessionUpdateRequestPayload {
  shouldTriggerResponse?: boolean;
}

// Agent Switching Lifecycle Payloads
export interface AgentSwitchStartedPayload {
  newAgentName: string;
  oldAgentName?: string;
}

export interface AgentSwitchCompletedPayload {
  agentName:string;
  success: true; // Literal true for success
}

export interface AgentSwitchFailedPayload {
  agentName: string;
  success: false; // Literal false for failure
  error?: string;
}

export interface PlayAgentIntroRequestedPayload {
  agentConfig: AgentConfig;
}

export interface AgentIntroPlaybackCompletedPayload {
  agentName: string;
  playedSuccessfully: boolean;
  error?: string;
}

// Tool Call Lifecycle Payloads
export interface ToolCallCompletedPayload {
  callId?: string; // Assuming a callId is available for correlation
  functionName: string;
  success: boolean;
  result?: any; // The result of the tool call if successful
  error?: string; // Error message if not successful
}

/**
 * Payload for the TOOL_CALL_STARTED event.
 */
export interface ToolCallStartedPayload {
  callId?: string;      // Optional: Unique ID for the tool call, if available when started.
  functionName: string; // The name of the function/tool being called.
  argsString?: string;  // Optional: The arguments for the function call, as a string.
}

// No payload events (signal only)
// USER_REQUESTED_CONNECT
// USER_REQUESTED_TALK_START
// USER_REQUESTED_TALK_END
// USER_TRIGGERED_CREATE_DDX
// USER_INTERRUPTED_ASSISTANT_SPEECH
// USER_CONFIRMED_AUDIO_MODAL
// CONNECTION_ATTEMPT_STARTED
// CONNECTION_ESTABLISHED
// DISCONNECT_COMPLETED
// SHOW_MIC_DENIED_MODAL_REQUESTED
// MICROPHONE_ACCESS_RECOVERED
// SERVER_OUTPUT_AUDIO_STARTED
// SERVER_OUTPUT_AUDIO_ENDED
// SERVER_AGENT_RESPONSE_CANCELLED
// SERVER_SESSION_UPDATED_ACK
// USER_SPEECH_STARTED
// USER_SPEECH_STOPPED
// AGENT_RESPONSE_COMPLETED
// OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED
// TOOL_CALL_STARTED 

export interface SettingsUpdatedPayload {
  mic?: boolean;
  audioOut?: boolean;
  ptt?: boolean;
} 

// Payload for updating transcript with agent-specific conversation context
export interface UpdateTranscriptWithAgentContextPayload {
  agentName: string;
} 
export const KatoEvents = {
  // User Intents
  USER_REQUESTED_CONNECT: 'USER_REQUESTED_CONNECT',
  USER_REQUESTED_DISCONNECT: 'USER_REQUESTED_DISCONNECT', // data: { isSwitchingAgent?: boolean }
  USER_SENT_TEXT_MESSAGE: 'USER_SENT_TEXT_MESSAGE', // data: { text: string, id: string }
  USER_SELECTED_AGENT: 'USER_SELECTED_AGENT', // data: { agentName: string }
  USER_TOGGLED_AUDIO_PLAYBACK: 'USER_TOGGLED_AUDIO_PLAYBACK', // data: boolean
  USER_REQUESTED_TALK_START: 'USER_REQUESTED_TALK_START',
  USER_REQUESTED_TALK_END: 'USER_REQUESTED_TALK_END',
  USER_REQUESTED_UI_MODE_CHANGE: 'USER_REQUESTED_UI_MODE_CHANGE', // data: 'avatar' | 'text'
  USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE: 'USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE', // data: 'conversation' | 'ptt' | 'no_mic'
  USER_TRIGGERED_CREATE_DDX: 'USER_TRIGGERED_CREATE_DDX',
  USER_INTERRUPTED_ASSISTANT_SPEECH: 'USER_INTERRUPTED_ASSISTANT_SPEECH',
  USER_CONFIRMED_AUDIO_MODAL: 'USER_CONFIRMED_AUDIO_MODAL',

  // Application/System Events
  SESSION_STATUS_WILL_CHANGE: 'SESSION_STATUS_WILL_CHANGE', // data: SessionStatus
  SESSION_STATUS_CHANGED: 'SESSION_STATUS_CHANGED',         // data: SessionStatus
  DATA_CHANNEL_STATUS_CHANGED: 'DATA_CHANNEL_STATUS_CHANGED', // data: 'open' | 'closed' | 'error'
  CONNECTION_ATTEMPT_STARTED: 'CONNECTION_ATTEMPT_STARTED',
  CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED', 
  CONNECTION_FAILED: 'CONNECTION_FAILED', // data: Error
  DISCONNECT_COMPLETED: 'DISCONNECT_COMPLETED',
  INTRO_AUDIO_STATE_CHANGED: 'INTRO_AUDIO_STATE_CHANGED', // data: { playing: boolean, error?: string, reason?: string, isRetryAfterModal?: boolean }
  AUDIO_MODAL_VISIBILITY_CHANGED: 'AUDIO_MODAL_VISIBILITY_CHANGED', // data: boolean (isVisible)
  ACTIVE_SPEAKER_TURN_CHANGED: 'ACTIVE_SPEAKER_TURN_CHANGED', // data: 'user' | 'patient' | 'preceptor' | 'none'
  AGENT_CONFIGURATION_LOADED: 'AGENT_CONFIGURATION_LOADED', // data: AgentConfig[]
  CURRENT_AGENT_CHANGED: 'CURRENT_AGENT_CHANGED', // data: { newAgentName: string, oldAgentName?: string, agentConfig?: AgentConfig }
  UI_MODE_CHANGED: 'UI_MODE_CHANGED', // data: 'avatar' | 'text'
  PTT_ACTIVE_CHANGED: 'PTT_ACTIVE_CHANGED', // data: boolean
  PTT_USER_SPEAKING_CHANGED: 'PTT_USER_SPEAKING_CHANGED', // data: boolean
  AUDIO_PLAYBACK_ENABLED_CHANGED: 'AUDIO_PLAYBACK_ENABLED_CHANGED', // data: boolean
  OUTPUT_AUDIO_BUFFER_STATUS_CHANGED: 'OUTPUT_AUDIO_BUFFER_STATUS_CHANGED', // data: boolean (isActive)
  AUDIO_INPUT_MODE_CHANGED: 'AUDIO_INPUT_MODE_CHANGED', // data: 'conversation' | 'ptt' | 'no_mic'
  SHOW_MIC_DENIED_MODAL_REQUESTED: 'SHOW_MIC_DENIED_MODAL_REQUESTED', // Custom event for the hook

  // Server-Driven Events
  SERVER_MESSAGE_RECEIVED: 'SERVER_MESSAGE_RECEIVED', // data: any (raw server message)
  SERVER_SESSION_STATUS_UPDATE: 'SERVER_SESSION_STATUS_UPDATE', // data: SessionStatus
  SERVER_TRANSCRIPT_ITEM: 'SERVER_TRANSCRIPT_ITEM', // data: Omit<TranscriptItem, 'id'> & { serverId?: string, idToAssign: string, status?: string }
  SERVER_OUTPUT_AUDIO_STARTED: 'SERVER_OUTPUT_AUDIO_STARTED',
  SERVER_OUTPUT_AUDIO_ENDED: 'SERVER_OUTPUT_AUDIO_ENDED',
  SERVER_AGENT_RESPONSE_CANCELLED: 'SERVER_AGENT_RESPONSE_CANCELLED',
  SERVER_SESSION_UPDATED_ACK: 'SERVER_SESSION_UPDATED_ACK',
  SERVER_SESSION_CREATED: 'SERVER_SESSION_CREATED', // data: { sessionId: string }
  SERVER_TRANSCRIPT_ITEM_CREATED: 'SERVER_TRANSCRIPT_ITEM_CREATED', // data: { itemId: string, role: string, text: string }
  SERVER_USER_TRANSCRIPT_COMPLETED: 'SERVER_USER_TRANSCRIPT_COMPLETED', // data: { itemId: string, transcript: string }
  SERVER_ASSISTANT_DELTA_RECEIVED: 'SERVER_ASSISTANT_DELTA_RECEIVED', // data: { itemId: string, deltaText: string }
  SERVER_ASSISTANT_MESSAGE_COMPLETED: 'SERVER_ASSISTANT_MESSAGE_COMPLETED', // data: { itemId: string, fullText: string }
  SERVER_FUNCTION_CALL_REQUESTED: 'SERVER_FUNCTION_CALL_REQUESTED', // data: { callId?: string, functionName: string, argsString: string }
  SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE: 'SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE', // data: { itemId: string, status: string, finalText?: string }

  // Specific VAD and Response Lifecycle events based on OpenAI docs
  USER_SPEECH_STARTED: 'USER_SPEECH_STARTED', // Server detected user started speaking
  USER_SPEECH_STOPPED: 'USER_SPEECH_STOPPED',   // Server detected user stopped speaking
  AGENT_RESPONSE_COMPLETED: 'AGENT_RESPONSE_COMPLETED', // Server indicated response.done

  // Client-Side Events (sent to server or for internal client communication)
  SEND_MESSAGE_TO_SERVER: 'SEND_MESSAGE_TO_SERVER', // data: { eventObj: any, eventNameSuffix?: string }
  SESSION_UPDATE_REQUESTED: 'SESSION_UPDATE_REQUESTED', // data?: { shouldTriggerResponse?: boolean }

  // Agent Switching Lifecycle Events
  AGENT_SWITCH_STARTED: 'AGENT_SWITCH_STARTED', // data: { newAgentName: string, oldAgentName?: string }
  AGENT_SWITCH_COMPLETED: 'AGENT_SWITCH_COMPLETED', // data: { agentName: string, success: true }
  AGENT_SWITCH_FAILED: 'AGENT_SWITCH_FAILED', // data: { agentName: string, success: false, error?: string }
  PLAY_AGENT_INTRO_REQUESTED: 'PLAY_AGENT_INTRO_REQUESTED', // data: { agentConfig: AgentConfig }
  AGENT_INTRO_PLAYBACK_COMPLETED: 'AGENT_INTRO_PLAYBACK_COMPLETED', // data: { agentName: string, playedSuccessfully: boolean, error?: string }
}; 
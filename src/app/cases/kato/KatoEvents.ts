/**
 * This file defines the comprehensive set of event types used throughout the Kato application.
 * These events are dispatched and listened to via the global EventBus (`src/app/lib/eventBus.ts`)
 * to enable decoupled communication between different modules, components, and services.
 *
 * When to use these events:
 * - To signal user interactions from UI components to state machines or services.
 * - For state machines to broadcast state changes or processed server messages to the rest of the app.
 * - For services to announce updates or the completion of asynchronous operations.
 * - To trigger actions in one part of the application in response to occurrences in another, without direct coupling.
 *
 * Each event is defined as a constant string and should be associated with a specific payload structure,
 * ideally defined in `KatoEventPayloads.ts`, to ensure type safety and clarity.
 */
import * as Payloads from './KatoEventPayloads';

/**
 * Defines the set of events used throughout the Kato application via the EventBus.
 * These events facilitate decoupled communication between different parts of the system,
 * such as the XState machines, UI components, and service handlers.
 */
export const KatoEvents = {
  // --- User Intents --- (Events initiated by user actions in the UI)

  /**
   * User has explicitly requested to connect to the Kato service.
   * Emitted by: UI components (e.g., connect button).
   * Consumed by: `agentLifecycleMachine` (or legacy connection logic).
   * Payload: None.
   */
  USER_REQUESTED_CONNECT: 'USER_REQUESTED_CONNECT' as const,

  /**
   * User has explicitly requested to disconnect from the Kato service.
   * Emitted by: UI components (e.g., disconnect button).
   * Consumed by: `agentLifecycleMachine` (or legacy connection logic).
   * Payload: {@link Payloads.UserRequestedDisconnectPayload}
   */
  USER_REQUESTED_DISCONNECT: 'USER_REQUESTED_DISCONNECT' as const, 

  /**
   * User has sent a text message.
   * Emitted by: UI components (e.g., chat input).
   * Consumed by: `agentLifecycleMachine` (to send to server or handle locally).
   * Payload: {@link Payloads.UserSentTextMessagePayload}
   */
  USER_SENT_TEXT_MESSAGE: 'USER_SENT_TEXT_MESSAGE' as const, 

  /**
   * User has selected a new agent from a list or menu.
   * Emitted by: UI components (e.g., agent selection dropdown).
   * Consumed by: `agentLifecycleMachine` (to initiate agent switch).
   * Payload: {@link Payloads.UserSelectedAgentPayload}
   */
  USER_SELECTED_AGENT: 'USER_SELECTED_AGENT' as const, 

  /**
   * User has toggled the audio playback setting (e.g., mute/unmute assistant speech).
   * Emitted by: UI components (e.g., audio playback toggle button).
   * Consumed by: Audio output services, `agentLifecycleMachine` (to update context).
   * Payload: {@link Payloads.UserToggledAudioPlaybackPayload}
   */
  USER_TOGGLED_AUDIO_PLAYBACK: 'USER_TOGGLED_AUDIO_PLAYBACK' as const,

  /**
   * User has initiated a request to start speaking (e.g., pressed PTT button).
   * Emitted by: UI components (e.g., PTT button).
   * Consumed by: Audio input services, `agentLifecycleMachine`.
   * Payload: None.
   */
  USER_REQUESTED_TALK_START: 'USER_REQUESTED_TALK_START' as const,

  /**
   * User has initiated a request to stop speaking (e.g., released PTT button).
   * Emitted by: UI components (e.g., PTT button).
   * Consumed by: Audio input services, `agentLifecycleMachine`.
   * Payload: None.
   */
  USER_REQUESTED_TALK_END: 'USER_REQUESTED_TALK_END' as const,

  /**
   * User has requested a change in the UI mode (e.g., from avatar view to text-only view).
   * Emitted by: UI components (e.g., UI mode switch).
   * Consumed by: UI layout components.
   * Payload: {@link Payloads.UserRequestedUiModeChangePayload}
   */
  USER_REQUESTED_UI_MODE_CHANGE: 'USER_REQUESTED_UI_MODE_CHANGE' as const,

  /**
   * User has requested a change in the audio input mode (e.g., conversation, PTT, no mic).
   * Emitted by: UI components (e.g., microphone settings).
   * Consumed by: Audio input services, `useAudioInputV2` hook, UI components.
   * Payload: {@link Payloads.UserRequestedAudioInputModeChangePayload}
   */
  USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE: 'USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE' as const,

  /**
   * User has triggered an action to create a differential diagnosis (DDX).
   * Emitted by: UI components (e.g., DDX button in a medical agent context).
   * Consumed by: Specific agent logic or DDX service.
   * Payload: None.
   */
  USER_TRIGGERED_CREATE_DDX: 'USER_TRIGGERED_CREATE_DDX' as const,

  /**
   * User has performed an action that should interrupt the assistant's current speech output.
   * Emitted by: UI components (e.g., pressing talk button while assistant is speaking).
   * Consumed by: Audio output services, `agentLifecycleMachine`.
   * Payload: None.
   */
  USER_INTERRUPTED_ASSISTANT_SPEECH: 'USER_INTERRUPTED_ASSISTANT_SPEECH' as const,

  /**
   * User has confirmed an audio-related modal (e.g., a modal asking for microphone permission or interaction to play audio).
   * Emitted by: UI components (e.g., confirmation button on an audio modal).
   * Consumed by: `agentLifecycleMachine` or audio services to proceed with audio actions.
   * Payload: None.
   */
  USER_CONFIRMED_AUDIO_MODAL: 'USER_CONFIRMED_AUDIO_MODAL' as const,

  /**
   * User has clicked the button to generate a Differential Diagnosis.
   * Emitted by: UI components (e.g., BottomBar)
   * Consumed by: Page logic (e.g., speak/page.tsx or write/page.tsx) to handle navigation/disconnection.
   * Payload: None
   */
  DDX_CREATE_CLICKED: 'DDX_CREATE_CLICKED' as const,

  /**
   * User has clicked the button to navigate to the 'write' (notes) page.
   * Emitted by: UI components (e.g., BottomBar)
   * Consumed by: Page logic (e.g., speak/page.tsx) to handle navigation/disconnection.
   * Payload: None
   */
  NAVIGATE_TO_WRITE_CLICKED: 'NAVIGATE_TO_WRITE_CLICKED' as const,

  /**
   * User has updated one or more settings (mic, audio output, PTT).
   * Emitted by: UI components (e.g., Settings controls in BottomBar).
   * Consumed by: Page logic (e.g., speak/page.tsx) to send to XState machine.
   * Payload: {@link Payloads.SettingsUpdatedPayload} // Ensure this payload is defined
   */
  SETTINGS_UPDATED: 'SETTINGS_UPDATED' as const,

  // --- Application/System Events --- (Events originating from within the client application logic)

  /**
   * A generic error reported by the Realtime API server during an active session.
   * Emitted by: `agentLifecycleMachine` when it receives an error-type message from the server.
   * Consumed by: UI components for displaying error details, error reporting services.
   * Payload: {@link Payloads.ServerSessionErrorPayload} // Assuming a new payload will be defined
   */
  SERVER_SESSION_ERROR: 'SERVER_SESSION_ERROR' as const,

  /**
   * Indicates that the session status is about to change. Allows components to prepare for a new status.
   * Emitted by: `agentLifecycleMachine` or connection management logic.
   * Consumed by: UI components for displaying intermediate states.
   * Payload: {@link Payloads.SessionStatusWillChangePayload}
   */
  SESSION_STATUS_WILL_CHANGE: 'SESSION_STATUS_WILL_CHANGE' as const,

  /**
   * Indicates that the session status has changed (e.g., CONNECTED, DISCONNECTED).
   * Emitted by: `agentLifecycleMachine` or connection management logic.
   * Consumed by: UI components, other services reacting to connection state.
   * Payload: {@link Payloads.SessionStatusChangedPayload}
   */
  SESSION_STATUS_CHANGED: 'SESSION_STATUS_CHANGED' as const,

  /**
   * Indicates a change in the status of the WebRTC data channel.
   * Emitted by: WebRTC connection logic.
   * Consumed by: `agentLifecycleMachine`, UI components for diagnostics.
   * Payload: {@link Payloads.DataChannelStatusChangedPayload}
   */
  DATA_CHANNEL_STATUS_CHANGED: 'DATA_CHANNEL_STATUS_CHANGED' as const,

  /**
   * A connection attempt to the Kato service has started.
   * Emitted by: `agentLifecycleMachine` or connection management logic.
   * Consumed by: UI components (e.g., to show a loading indicator).
   * Payload: None.
   */
  CONNECTION_ATTEMPT_STARTED: 'CONNECTION_ATTEMPT_STARTED' as const,

  /**
   * Connection to the Kato service has been successfully established.
   * Emitted by: `agentLifecycleMachine` or WebRTC connection logic (e.g., on data channel open).
   * Consumed by: UI components, services that require an active connection.
   * Payload: None.
   */
  CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED' as const, 

  /**
   * Connection to the Kato service has failed.
   * Emitted by: `agentLifecycleMachine` or connection management logic.
   * Consumed by: UI components (to show error messages), error reporting services.
   * Payload: {@link Payloads.ConnectionFailedPayload}
   */
  CONNECTION_FAILED: 'CONNECTION_FAILED' as const,

  /**
   * Disconnection process has completed (e.g., after user request or agent switch).
   * Emitted by: `agentLifecycleMachine` or connection management logic.
   * Consumed by: UI components, services cleaning up resources.
   * Payload: None.
   */
  DISCONNECT_COMPLETED: 'DISCONNECT_COMPLETED' as const,

  /**
   * The state of the agent's introductory audio has changed (playing, stopped, error).
   * Emitted by: Agent intro audio playback logic.
   * Consumed by: UI components (e.g., to show playback status), `agentLifecycleMachine`.
   * Payload: {@link Payloads.IntroAudioStateChangedPayload}
   */
  INTRO_AUDIO_STATE_CHANGED: 'INTRO_AUDIO_STATE_CHANGED' as const,

  /**
   * The visibility of an audio-related modal (e.g., microphone permission, user interaction for audio) has changed.
   * Emitted by: UI components managing such modals.
   * Consumed by: `agentLifecycleMachine` or other UI components.
   * Payload: {@link Payloads.AudioModalVisibilityChangedPayload}
   */
  AUDIO_MODAL_VISIBILITY_CHANGED: 'AUDIO_MODAL_VISIBILITY_CHANGED' as const,

  /**
   * The active speaker turn has changed (e.g., user, specific agent role, or none).
   * Emitted by: Logic determining active speaker (could be server-driven or client-side estimation).
   * Consumed by: UI components (e.g., to highlight active speaker avatar).
   * Payload: {@link Payloads.ActiveSpeakerTurnChangedPayload}
   */
  ACTIVE_SPEAKER_TURN_CHANGED: 'ACTIVE_SPEAKER_TURN_CHANGED' as const,

  /**
   * Agent configurations have been loaded into the application.
   * Emitted by: Configuration loading service or `App.tsx`.
   * Consumed by: `agentLifecycleMachine`, UI components displaying agent lists.
   * Payload: {@link Payloads.AgentConfigurationLoadedPayload}
   */
  AGENT_CONFIGURATION_LOADED: 'AGENT_CONFIGURATION_LOADED' as const,

  /**
   * The current active agent has changed.
   * Note: Review if this event is still necessary if UI components and services can derive the current agent
   * directly from the `agentLifecycleMachine`'s state/context.
   * Emitted by: `agentLifecycleMachine` (potentially, or legacy agent management).
   * Consumed by: UI components, services that need to adapt to the current agent.
   * Payload: {@link Payloads.CurrentAgentChangedPayload}
   */
  CURRENT_AGENT_CHANGED: 'CURRENT_AGENT_CHANGED' as const,

  /**
   * The UI mode (e.g., avatar, text-only) has changed.
   * Emitted by: UI layout components or logic handling `USER_REQUESTED_UI_MODE_CHANGE`.
   * Consumed by: Various UI components adapting to the mode.
   * Payload: {@link Payloads.UiModeChangedPayload}
   */
  UI_MODE_CHANGED: 'UI_MODE_CHANGED' as const,

  /**
   * The status of Push-to-Talk (PTT) has changed (active/inactive).
   * Emitted by: `useAudioInputV2` hook or PTT logic.
   * Consumed by: UI components (e.g., to show PTT button state).
   * Payload: {@link Payloads.PttActiveChangedPayload}
   */
  PTT_ACTIVE_CHANGED: 'PTT_ACTIVE_CHANGED' as const,

  /**
   * Indicates whether the user is currently speaking while PTT is active.
   * Emitted by: `useAudioInputV2` hook or PTT voice activity detection logic.
   * Consumed by: UI components (e.g., to provide visual feedback for speaking).
   * Payload: {@link Payloads.PttUserSpeakingChangedPayload}
   */
  PTT_USER_SPEAKING_CHANGED: 'PTT_USER_SPEAKING_CHANGED' as const,

  /**
   * The master audio playback enabled/disabled status has changed.
   * Emitted by: Logic handling `USER_TOGGLED_AUDIO_PLAYBACK`.
   * Consumed by: Audio output services.
   * Payload: {@link Payloads.AudioPlaybackEnabledChangedPayload}
   */
  AUDIO_PLAYBACK_ENABLED_CHANGED: 'AUDIO_PLAYBACK_ENABLED_CHANGED' as const,

  /**
   * The status of the output audio buffer has changed (e.g., actively playing or idle).
   * Emitted by: Audio output service managing the playback buffer.
   * Consumed by: UI components (e.g., to show if assistant is speaking), `agentLifecycleMachine`.
   * Payload: {@link Payloads.OutputAudioBufferStatusChangedPayload}
   */
  OUTPUT_AUDIO_BUFFER_STATUS_CHANGED: 'OUTPUT_AUDIO_BUFFER_STATUS_CHANGED' as const,

  /**
   * The audio input mode has changed.
   * Emitted by: `useAudioInputV2` hook or logic handling `USER_REQUESTED_AUDIO_INPUT_MODE_CHANGE`.
   * Consumed by: UI components, audio input services.
   * Payload: {@link Payloads.AudioInputModeChangedPayload}
   */
  AUDIO_INPUT_MODE_CHANGED: 'AUDIO_INPUT_MODE_CHANGED' as const,

  /**
   * A request to show the microphone access denied modal has been made.
   * Emitted by: `useMicrophone` hook or similar permission handling logic.
   * Consumed by: UI component responsible for displaying the modal.
   * Payload: None.
   */
  SHOW_MIC_DENIED_MODAL_REQUESTED: 'SHOW_MIC_DENIED_MODAL_REQUESTED' as const,

  /**
   * An error occurred while trying to access the microphone.
   * Emitted by: `useMicrophone` hook or audio input services.
   * Consumed by: UI components (to display error messages/state).
   * Payload: {@link Payloads.MicrophoneAccessErrorPayload}
   */
  MICROPHONE_ACCESS_ERROR: 'MICROPHONE_ACCESS_ERROR' as const,

  /**
   * Microphone access has been successfully recovered after a previous error.
   * Emitted by: `useMicrophone` hook or audio input services.
   * Consumed by: UI components (to clear error messages/state).
   * Payload: None.
   */
  MICROPHONE_ACCESS_RECOVERED: 'MICROPHONE_ACCESS_RECOVERED' as const,

  // --- Server-Driven Events --- (Events originating from messages received from the Kato server)

  /**
   * A raw message has been received from the Kato server via the data channel.
   * This is a generic event; more specific events are preferred for structured data.
   * Emitted by: WebRTC data channel message handler.
   * Consumed by: Central server message processing logic (e.g., in `App.tsx` or `agentLifecycleMachine`).
   * Payload: {@link Payloads.ServerMessageReceivedPayload}
   */
  SERVER_MESSAGE_RECEIVED: 'SERVER_MESSAGE_RECEIVED' as const,

  /**
   * The server has sent an update regarding the session status.
   * Emitted by: Server message processing logic.
   * Consumed by: `agentLifecycleMachine`, UI components.
   * Payload: {@link Payloads.ServerSessionStatusUpdatePayload}
   */
  SERVER_SESSION_STATUS_UPDATE: 'SERVER_SESSION_STATUS_UPDATE' as const,

  /**
   * The server has sent a new transcript item or an update to an existing one.
   * Emitted by: Server message processing logic.
   * Consumed by: Transcript management service/context.
   * Payload: {@link Payloads.ServerTranscriptItemPayload}
   */
  SERVER_TRANSCRIPT_ITEM: 'SERVER_TRANSCRIPT_ITEM' as const,

  /**
   * The server has indicated that audio output (assistant speech) has started.
   * Emitted by: Server message processing logic.
   * Consumed by: Audio output services, UI components.
   * Payload: None.
   */
  SERVER_OUTPUT_AUDIO_STARTED: 'SERVER_OUTPUT_AUDIO_STARTED' as const,

  /**
   * The server has indicated that audio output (assistant speech) has ended.
   * Emitted by: Server message processing logic.
   * Consumed by: Audio output services, UI components.
   * Payload: None.
   */
  SERVER_OUTPUT_AUDIO_ENDED: 'SERVER_OUTPUT_AUDIO_ENDED' as const,

  /**
   * The server has indicated that the current agent response has been cancelled.
   * Emitted by: Server message processing logic.
   * Consumed by: `agentLifecycleMachine`, UI components, audio output service (to stop playback).
   * Payload: None.
   */
  SERVER_AGENT_RESPONSE_CANCELLED: 'SERVER_AGENT_RESPONSE_CANCELLED' as const,

  /**
   * The server has acknowledged an update to the session (e.g., new agent instructions).
   * Emitted by: Server message processing logic.
   * Consumed by: `agentLifecycleMachine` or logic that sent the session update.
   * Payload: None.
   */
  SERVER_SESSION_UPDATED_ACK: 'SERVER_SESSION_UPDATED_ACK' as const,

  /**
   * The server has confirmed the creation of a new session.
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: `agentLifecycleMachine`, Transcript context, UI.
   * Payload: {@link Payloads.ServerSessionCreatedPayload}
   */
  SERVER_SESSION_CREATED: 'SERVER_SESSION_CREATED' as const,

  /**
   * The server has indicated a new transcript item has been created.
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Transcript context/service.
   * Payload: {@link Payloads.ServerTranscriptItemCreatedPayload}
   */
  SERVER_TRANSCRIPT_ITEM_CREATED: 'SERVER_TRANSCRIPT_ITEM_CREATED' as const,

  /**
   * The server has indicated that a user's transcript (speech-to-text) is complete.
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Transcript context/service.
   * Payload: {@link Payloads.ServerUserTranscriptCompletedPayload}
   */
  SERVER_USER_TRANSCRIPT_COMPLETED: 'SERVER_USER_TRANSCRIPT_COMPLETED' as const,

  /**
   * A delta (partial update) for a user's transcript item has been received from the server.
   * This is typically used for live transcription updates.
   * Emitted by: `agentLifecycleMachine` (after processing server message `conversation.item.input_audio_transcription.delta`).
   * Consumed by: `TranscriptContext` (to update the user's message in real-time).
   * Payload: {@link Payloads.ServerUserTranscriptDeltaPayload}
   */
  SERVER_USER_TRANSCRIPT_DELTA: 'SERVER_USER_TRANSCRIPT_DELTA' as const,

  /**
   * The server is streaming parts (deltas) of an assistant's message.
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Transcript context/service (to update an in-progress assistant message).
   * Payload: {@link Payloads.ServerAssistantDeltaReceivedPayload}
   */
  SERVER_ASSISTANT_DELTA_RECEIVED: 'SERVER_ASSISTANT_DELTA_RECEIVED' as const,

  /**
   * The server has indicated that an assistant's message is complete.
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Transcript context/service.
   * Payload: {@link Payloads.ServerAssistantMessageCompletedPayload}
   */
  SERVER_ASSISTANT_MESSAGE_COMPLETED: 'SERVER_ASSISTANT_MESSAGE_COMPLETED' as const,

  /**
   * The server is requesting the client to execute a function call (tool use).
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Tool execution logic / `agentLifecycleMachine`.
   * Payload: {@link Payloads.ServerFunctionCallRequestedPayload}
   */
  SERVER_FUNCTION_CALL_REQUESTED: 'SERVER_FUNCTION_CALL_REQUESTED' as const,

  /**
   * The server has sent an update to the status of a transcript item (e.g., processing, failed).
   * Emitted by: Server message processing logic (derived from Task 2).
   * Consumed by: Transcript context/service.
   * Payload: {@link Payloads.ServerTranscriptItemStatusUpdatePayload}
   */
  SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE: 'SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE' as const,

  // --- Specific VAD and Response Lifecycle Events --- (Often server-driven, related to speech and agent responses)

  /**
   * Server has detected that the user started speaking (Voice Activity Detection).
   * Emitted by: Server message processing logic.
   * Consumed by: UI components (e.g., to show user speaking indicator), `agentLifecycleMachine`.
   * Payload: None.
   */
  USER_SPEECH_STARTED: 'USER_SPEECH_STARTED' as const,

  /**
   * Server has detected that the user stopped speaking (Voice Activity Detection).
   * Emitted by: Server message processing logic.
   * Consumed by: UI components, `agentLifecycleMachine` (e.g., to finalize user input).
   * Payload: None.
   */
  USER_SPEECH_STOPPED: 'USER_SPEECH_STOPPED' as const,

  /**
   * Server has indicated that the agent's current response turn is complete.
   * Emitted by: Server message processing logic.
   * Consumed by: `agentLifecycleMachine`.
   * Payload: None.
   */
  AGENT_RESPONSE_COMPLETED: 'AGENT_RESPONSE_COMPLETED' as const,

  // --- Client-Side Events --- (For internal client communication or preparing messages for the server)

  /**
   * An event that signals a message should be formatted and sent to the Kato server.
   * Emitted by: Various client-side logic that needs to communicate with the server (e.g., `agentLifecycleMachine`).
   * Consumed by: Central message sending service (e.g., within `KatoRTCContext` or `agentLifecycleMachine`).
   * Payload: {@link Payloads.SendMessageToServerPayload}
   */
  SEND_MESSAGE_TO_SERVER: 'SEND_MESSAGE_TO_SERVER' as const,

  /**
   * A request to update the session on the server (e.g., with new agent instructions, tools).
   * Emitted by: `agentLifecycleMachine` or agent management logic.
   * Consumed by: Logic responsible for sending `session.update` messages to the server.
   * Payload: {@link Payloads.SessionUpdateRequestPayload}
   */
  SESSION_UPDATE_REQUESTED: 'SESSION_UPDATE_REQUESTED' as const,

  // --- Agent Switching Lifecycle Events ---

  /**
   * The process of switching to a new agent has started.
   * Emitted by: `agentLifecycleMachine`.
   * Consumed by: UI components (to show switching state), other services that need to react to agent changes.
   * Payload: {@link Payloads.AgentSwitchStartedPayload}
   */
  AGENT_SWITCH_STARTED: 'AGENT_SWITCH_STARTED' as const,

  /**
   * The agent switching process has completed successfully.
   * Emitted by: `agentLifecycleMachine`.
   * Consumed by: UI components, other services.
   * Payload: {@link Payloads.AgentSwitchCompletedPayload}
   */
  AGENT_SWITCH_COMPLETED: 'AGENT_SWITCH_COMPLETED' as const,

  /**
   * The agent switching process has failed.
   * Emitted by: `agentLifecycleMachine`.
   * Consumed by: UI components (to show error), error reporting.
   * Payload: {@link Payloads.AgentSwitchFailedPayload}
   */
  AGENT_SWITCH_FAILED: 'AGENT_SWITCH_FAILED' as const,

  /**
   * A request to play the introductory audio for an agent.
   * Emitted by: `agentLifecycleMachine` when a new agent is selected and has an intro.
   * Consumed by: Agent intro audio playback service.
   * Payload: {@link Payloads.PlayAgentIntroRequestedPayload}
   */
  PLAY_AGENT_INTRO_REQUESTED: 'PLAY_AGENT_INTRO_REQUESTED' as const,

  /**
   * The playback of an agent's introductory audio has completed.
   * Emitted by: Agent intro audio playback service.
   * Consumed by: `agentLifecycleMachine`.
   * Payload: {@link Payloads.AgentIntroPlaybackCompletedPayload}
   */
  AGENT_INTRO_PLAYBACK_COMPLETED: 'AGENT_INTRO_PLAYBACK_COMPLETED' as const,

  // --- Client-side Audio Output Control Events ---

  /**
   * A request to clear any pending audio in the output buffer.
   * Useful when interrupting speech or switching agents to prevent stale audio playback.
   * Emitted by: `agentLifecycleMachine`, UI components (e.g. interrupt button).
   * Consumed by: Audio output service.
   * Payload: None.
   */
  OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED: 'OUTPUT_AUDIO_BUFFER_CLEAR_REQUESTED' as const,

  // --- Tool Call Lifecycle Events (for UI and other listeners) ---

  /**
   * A tool call (function call by the agent) has been initiated.
   * Emitted by: `agentLifecycleMachine` or tool execution orchestrator.
   * Consumed by: UI components (to show tool activity indicator).
   * Payload: {@link Payloads.ToolCallStartedPayload} (e.g., { callId: string, functionName: string, argsString: string })
   */
  TOOL_CALL_STARTED: "TOOL_CALL_STARTED" as const,

  /**
   * A tool call has completed (either successfully or with an error).
   * Emitted by: `agentLifecycleMachine` or tool execution orchestrator after receiving result/error.
   * Consumed by: UI components (to hide activity indicator, display results/errors).
   * Payload: {@link Payloads.ToolCallCompletedPayload}
   */
  TOOL_CALL_COMPLETED: "TOOL_CALL_COMPLETED" as const,

  USER_REQUESTED_OPEN_SETTINGS_MODAL: 'USER_REQUESTED_OPEN_SETTINGS_MODAL',
  USER_REQUESTED_CLOSE_SETTINGS_MODAL: 'USER_REQUESTED_CLOSE_SETTINGS_MODAL',
  USER_UPDATED_SETTINGS: 'USER_UPDATED_SETTINGS',
}; 
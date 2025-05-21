# Voice Activity Detection (VAD) Implementation Overview

This document outlines the Voice Activity Detection (VAD) feature in the Kato Realtime Patient Simulator, specifically how user speech detection is implemented and reflected in the UI when using a WebRTC connection to OpenAI's Realtime API.

## Architecture

The VAD feature relies on **server-side processing performed by OpenAI's Realtime API**. The client application streams audio (potentially via a backend proxy) to OpenAI, which analyzes it and signals VAD events back to the client.

## Client-Side VAD Event Flow

1.  **Audio Streaming**: The client captures microphone audio and streams it towards the OpenAI Realtime API endpoint. This involves:
    *   Audio capture mechanisms (e.g., `navigator.mediaDevices.getUserMedia` called within `src/app/lib/realtimeConnection.ts`).
    *   WebRTC connection managed by `src/app/lib/realtimeConnection.ts`.

2.  **OpenAI Server VAD & Signaling**: OpenAI's Realtime API performs VAD on the received audio stream and sends messages back to the client (likely relayed through the backend proxy if one is used). The key VAD events received by the client's state machine are:
    *   On speech start: `` `{"type": "input_audio_transcription.user_speech.started"}` ``
    *   On speech end: `` `{"type": "input_audio_transcription.user_speech.stopped"}` ``
    *(Note: OpenAI's documentation also mentions `input_audio_buffer.speech_started/stopped`. The events above are what the client's `katoAgentLifecycleMachine.ts` is configured to process.)*

3.  **State Machine Processing & Relaying (`src/app/machines/katoAgentLifecycleMachine.ts`)**:
    *   Receives the VAD messages (e.g., `input_audio_transcription.user_speech.started`) from the server (OpenAI via proxy) via its WebRTC data channel handler.
    *   Emits corresponding client-side events (`KatoEvents.USER_SPEECH_STARTED` or `KatoEvents.USER_SPEECH_STOPPED`) onto the global event bus (`src/app/lib/eventBus.ts`). These events are defined in `src/app/cases/kato/KatoEvents.ts`.
    *   **Configures OpenAI VAD**: Sends `session.update` messages to the OpenAI Realtime API. When `pushToTalk` mode is `false` (conversation mode), this message includes `turn_detection` settings (e.g., `type: "server_vad"` or potentially `"semantic_vad"`) and parameters like `threshold`, `prefix_padding_ms`, and `silence_duration_ms` to customize OpenAI's VAD behavior.

4.  **UI Update (`src/app/cases/kato/speak/page.tsx`)**:
    *   Subscribes to `KatoEvents.USER_SPEECH_STARTED` and `KatoEvents.USER_SPEECH_STOPPED` from the event bus.
    *   Updates its `isUserActuallySpeaking` local state, triggering visual feedback (e.g., avatar animations) to indicate user speech.

## Influence of `pushToTalk` Setting

The `pushToTalk` setting (managed by `katoAgentLifecycleMachine.ts`) dictates VAD configuration sent to OpenAI:

*   **Conversation Mode (`pushToTalk === false`)**:
    *   The client instructs the OpenAI Realtime API (via `session.update`) to use its VAD features (e.g., `turn_detection: { type: "server_vad", ... }`). Parameters like `create_response` and `interrupt_response` can also be configured for conversation mode.
    *   OpenAI continuously analyzes audio and sends VAD events.

*   **Push-to-Talk Mode (`pushToTalk === true`)**:
    *   The client sends `turn_detection: null` to OpenAI in the `session.update` message, typically disabling OpenAI's automatic VAD-based turn detection for user speech.
    *   Audio processing for user turns is primarily initiated by the client upon PTT release (e.g., by sending an `input_audio_buffer.commit` message if that's part of the interaction pattern with the backend/OpenAI).
    *   OpenAI may still perform VAD on any explicitly committed audio chunk and could send `input_audio_transcription.user_speech.started/stopped` messages based on that analysis.

## Key Client-Side Files & Their VAD Roles

*   `src/app/cases/kato/speak/page.tsx`: **UI Consumer** - Displays visual feedback based on VAD events.
*   `src/app/machines/katoAgentLifecycleMachine.ts`: **Logic Hub & OpenAI Interaction** - Processes VAD messages from OpenAI (via backend), emits client VAD events, and configures OpenAI's VAD parameters.
*   `src/app/cases/kato/KatoEvents.ts`: **Event Definitions** - Defines client-side `USER_SPEECH_STARTED` and `USER_SPEECH_STOPPED` events.
*   `src/app/lib/eventBus.ts` & `src/app/contexts/EventBusContext.tsx`: **Event Bus System** - Facilitates decoupled event communication.
*   `src/app/lib/realtimeConnection.ts`: **WebRTC Management** - Handles audio streaming towards OpenAI.
*   `src/app/client-layout.tsx`: **Context Provision** - Provides global contexts for VAD-related components.

## Summary

The VAD system leverages **OpenAI's Realtime API server-side VAD capabilities**. The client streams audio, configures OpenAI's VAD behavior (especially in conversation mode), and reactively updates its UI based on VAD events relayed from OpenAI by the client-side state machine. 
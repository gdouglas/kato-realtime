# Feature: Write Mode (Text-Based Interaction)

## 1. Overview

Write Mode provides a text-only interface for users to interact with Kato agents. It serves as an alternative to Speak Mode (voice interaction) and as a default mode when microphone access is unavailable or denied. Users can seamlessly switch between Write and Speak modes without disrupting the session or connection to the agent.

## 2. Key Characteristics

*   **Input Method:** User types text messages into an input field.
*   **Output Method:** Agent responses are displayed as text messages in a chat log.
*   **No Audio:** Write Mode does not utilize microphone input or provide audio output from the agent.
*   **Agent Agnostic:** All existing and future agents should be compatible with Write Mode.
*   **Connection Persistence:** Switching between Write Mode and Speak Mode should not terminate or require re-establishment of the connection to the Realtime API. The underlying session with the agent remains active.

## 3. User Stories

*   **US001:** As a user, I want to be able to type my messages to the agent so that I can communicate without using voice.
*   **US002:** As a user, I want to see the agent\'s responses as text messages in a chat log so that I can easily read the conversation.
*   **US003:** As a user, if I deny microphone permissions or do not have a microphone, I want the application to default to Write Mode so that I can still interact with the agent.
*   **US004:** As a user, I want to be able to switch between Speak Mode and Write Mode at any time so that I can choose my preferred interaction method.
*   **US005:** As a user, I want to be able to switch between different Kato agents while in Write Mode, just as I can in Speak Mode.
*   **US006:** As a user, when I switch from Speak Mode to Write Mode, I want the ongoing conversation context to be maintained.
*   **US007:** As a user, when I switch from Write Mode to Speak Mode, I want the ongoing conversation context to be maintained.

## 4. Technical Considerations

*   **UI State:** The application will need to manage a state indicating whether it\'s in "Speak" or "Write" mode (likely within `katoAgentLifecycleMachine.ts`).
*   **Realtime API Configuration (`session.update`):**
    *   When entering Write Mode (or if it\'s the default due to no mic):
        *   The `session.update` message to the Realtime API must set `session: { modalities: ["text"] }`.
        *   The `session.update` message must also set `session: { turn_detection: null }`, as VAD is not applicable to text-only input.
    *   When switching back to Speak Mode, `session.modalities` would be updated (e.g., `["text", "audio"]`) and `session.turn_detection` would be configured with appropriate server-side VAD settings (including `create_response: true` and `interrupt_response` flags as needed for speak mode).
*   **Event Handling for User Input (Client to Server):**
    *   User submits text: Client sends a `conversation.item.create` message with `item: { type: "message", role: "user", content: [{ type: "input_text", text: "User\'s typed message" }] }`.
    *   Request agent response: Immediately after sending the user\'s message, the client **must** send a `response.create` message. To ensure only text is returned, this can be specified as `response: { modalities: ["text"] }`.
*   **Event Handling for Agent Output (Server to Client):**
    *   Agent response begins: Server sends `response.created`.
    *   Agent text streams in: Server sends `response.text.delta` events. These can be used to display the agent\'s message progressively.
    *   Agent text fully received: Server sends `response.text.done`, `response.output_item.done`, and finally `response.done`. The complete message is typically in the `response.done` event\'s payload (`response.output[0].content[0].text` or similar structure based on `response.output_item.added` and `response.content_part.added`).
*   **Interface:**
    *   A clear visual toggle/button to switch between Speak and Write modes (e.g., in a settings panel or main toolbar).
    *   A chat input field and a message display area for Write Mode.
    *   Agent switcher UI should remain functional in Write Mode.
*   **Error Handling:** Gracefully handle scenarios where mode switching might encounter issues, though the goal is seamless transition.

## 5. Impact on Existing Systems and Key Development Areas

This section details which parts of the existing `src/app` structure will be primarily involved in implementing Write Mode.

*   **State Management (`src/app/machines/katoAgentLifecycleMachine.ts`):**
    *   **Context Update:** Add an `interactionMode: \'speak\' | \'write\'` field to the machine\'s context.
    *   **Mode Switching Logic:** Implement actions/transitions to handle `USER_REQUESTED_SWITCH_TO_WRITE_MODE` and `USER_REQUESTED_SWITCH_TO_SPEAK_MODE` events. These transitions will update `interactionMode` and trigger `session.update` with appropriate modalities and VAD settings.
    *   **Text Input Handling:** Add new actions to:
        1.  Receive a user-submitted text message (e.g., via a new machine event like `SUBMIT_TEXT_MESSAGE`).
        2.  Send `conversation.item.create` to the Realtime API with the text.
        3.  Immediately follow up with `response.create` (configured for text-only response).
    *   The existing `sendSessionUpdateOnActivation` action will need to read the `interactionMode` from context to send the correct `session.update` parameters.

*   **UI and Components (`src/app/cases/kato/speak/page.tsx`, `src/app/components/`):**
    *   **New Page/View Logic:** Decide whether to create a new route/page (e.g., `src/app/cases/kato/write/page.tsx`) or adapt the existing `speak/page.tsx` to conditionally render Speak or Write mode UI based on `interactionMode` from the state machine.
    *   **Mode Toggle UI:** Implement a component for switching between Speak and Write modes. This component will send events to `katoAgentLifecycleMachine`.
    *   **Write Mode Components:** Create new React components:
        *   `ChatInput.tsx`: For text input and a send button.
        *   Potentially `MessageList.tsx` or `MessageBubble.tsx` if `Transcript.tsx` is not perfectly suited or needs a wrapper for chat-specific styling.
    *   **Reusable Components:**
        *   `Transcript.tsx`: Can likely be reused or adapted to display the chat log in Write Mode.
        *   Agent switcher components should remain functional.

*   **Contexts (`src/app/contexts/`):**
    *   **`AgentLifecycleContext.tsx`**: Crucial for the new Write Mode UI to interact with the state machine (send events, subscribe to state changes like `interactionMode`).
    *   **`TranscriptContext.tsx`**: Will be consumed by the Write Mode UI to display the conversation history. Its current functionality for receiving and updating transcripts should be largely compatible.
    *   **`EventBusContext.tsx`**: The event bus will facilitate communication. New events (see below) might be defined and used.

*   **Core Libraries (`src/app/lib/`):**
    *   **`realtimeConnection.ts`**: Ensure that microphone input streaming is deactivated or not initiated if the `interactionMode` is \'write\'. The core data channel for API event communication remains essential.
    *   **`eventBus.ts`**: The definition of the bus itself.

*   **Event Definitions (`src/app/cases/kato/KatoEvents.ts`):**
    *   Consider adding new `KatoEvents` such as:
        *   `USER_REQUESTED_SWITCH_TO_WRITE_MODE`
        *   `USER_REQUESTED_SWITCH_TO_SPEAK_MODE`
        *   `USER_TEXT_MESSAGE_SUBMITTED` (payload: `{ text: string }`)
        *   `INTERACTION_MODE_CHANGED` (emitted by the machine, payload: `{ mode: \'speak\' | \'write\' }`)

*   **Application Initialization & Layout (`src/app/App.tsx`, `src/app/client-layout.tsx`):**
    *   These will continue to provide the foundational context providers. The new Write Mode UI will exist within this established structure.

## 6. Clarified API Usage

*   **`create_response` parameter for Write Mode:** The `create_response` flag (which is part of the `turn_detection` object) is not directly used in Write Mode because `turn_detection` itself will be `null`. Instead, the client **must explicitly send a `response.create` client event** after each `conversation.item.create` (user text input) to trigger an agent response.
*   **Server behavior with `modalities: ["text"]` and `turn_detection: null`:** The server will wait for a `conversation.item.create` event followed by a `response.create` event before generating a text response. It does not automatically respond purely upon receiving a user\'s text message item.
*   **"User is typing..." indicators:** This is a UI/UX feature. The Realtime API itself does not provide direct support for "user is typing" indicators from the *user\'s* side to the *agent*. For agent "typing" indicators (agent is generating response), the client can use the `response.created` event to show a general "Agent is thinking..." and then use the stream of `response.text.delta` events to simulate a typing effect as the agent\'s message arrives. 
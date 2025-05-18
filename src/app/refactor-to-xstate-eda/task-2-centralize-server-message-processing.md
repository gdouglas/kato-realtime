### Task 2: Centralize Server Message Processing in XState Machine

**Objective:**
Establish the `agentLifecycleMachine`'s `processAndRelayServerMessage` action as the single, authoritative processor for all incoming RTC data channel messages. This involves refactoring `useHandleServerEvent.ts` to eliminate redundant message processing and ensuring all application-relevant information derived from server messages is emitted as specific events onto the `eventBus` by the XState machine.

**Rationale:**
Currently, server messages seem to be processed in two places: by the XState machine (which emits some events to the `eventBus` and uses `lastServerMessage` for `AppContents`) and by `useHandleServerEvent.ts` (triggered by `AppContents` observing `lastServerMessage`). This dual processing is inefficient, can lead to inconsistencies, and complicates the data flow. Centralizing this in the XState machine will create a clear and robust pipeline for server messages.

**Steps:**

1.  **Enhance `processAndRelayServerMessage` in `agentLifecycleMachine.ts`:**
    *   Review all message types and data currently processed by the `switch` statement in `useHandleServerEvent.ts` (e.g., `session.created`, `conversation.item.created`, `conversation.item.input_audio_transcription.completed`, `response.audio_transcript.delta`, `response.done` which includes function calls, `response.output_item.done`).
    *   For each of these, ensure `processAndRelayServerMessage` (within the XState machine) correctly parses the raw RTC message and extracts the relevant information.
    *   Instead of directly manipulating contexts (like Transcript context), `processAndRelayServerMessage` should emit fine-grained, domain-specific events onto the `eventBus`. Examples:
        *   `KatoEvents.SERVER_SESSION_CREATED` (payload: session ID)
        *   `KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED` (payload: item ID, role, initial text)
        *   `KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED` (payload: item ID, final transcript)
        *   `KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED` (payload: item ID, delta text)
        *   `KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED` (payload: item ID, full text, from `response.output_item.done` or `response.done`)
        *   `KatoEvents.SERVER_FUNCTION_CALL_REQUESTED` (payload: call ID, function name, arguments from `response.done`)
        *   `KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE` (payload: item ID, status `DONE` from `response.output_item.done`)
        *   `KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED` (already exists for started/stopped, ensure consistency).
    *   The machine already handles `session.transfer_agent.request` internally (in `assignRtcEventHandlers`). Consolidate such specific command detection within `processAndRelayServerMessage` if it simplifies logic, or ensure `assignRtcEventHandlers` only sends internal machine events and `processAndRelayServerMessage` handles general message-to-eventBus translation.

2.  **Remove Redundant Processing in `AppContents.tsx`:**
    *   Delete the `useEffect` in `AppContents.tsx` that listens to `agentLifecycle.state.context.lastServerMessage` and calls `handleServerEventRef.current(lastServerMessage)`.
    *   The `lastServerMessage` field in the XState machine's context might no longer be needed if all processing happens immediately within `processAndRelayServerMessage` and results are emitted to the bus. Evaluate if it can be removed from the context and related actions (`assignLastServerMessage`, `clearLastServerMessage`).

3.  **Refactor/Replace `useHandleServerEvent.ts`:**
    *   **Remove Direct Context Manipulations:** All direct calls to `addTranscriptMessage`, `updateTranscriptMessage`, `updateTranscriptItem`, `setIsOutputAudioBufferActive` should be removed from this hook.
    *   **Function Call Handling:** The `handleFunctionCall` logic needs a new home:
        *   Option A (Preferred): Create a new, dedicated hook or service (e.g., `useToolExecutor` or `toolExecutorService`) that subscribes to `KatoEvents.SERVER_FUNCTION_CALL_REQUESTED` from the `eventBus`.
        *   This new module would execute the function (using `currentAgent.toolLogic` or other mechanisms) and then send the result back to the server (e.g., by emitting a `SEND_FUNCTION_RESULT_TO_RTC` event on the `eventBus`, which the XState machine or another RTC-focused service could listen to and act upon by sending a message over the data channel).
        *   The logic for `transferAgents` if triggered by a function call should now be fully handled by the XState machine reacting to `SERVER_REQUESTED_AGENT_TRANSFER` (which it already does).
    *   **Guardrail Processing:** The `processGuardrail` logic might also become part of a dedicated transcript processing hook that listens to relevant transcript events on the bus, or it could be triggered by the state machine emitting a specific event like `KatoEvents.TEXT_READY_FOR_GUARDRAIL`.
    *   The `useHandleServerEvent.ts` hook might become very thin or entirely unnecessary.

4.  **Update Consumers to Use `eventBus`:**
    *   Modify `TranscriptContext` consumers (like the `Transcript` component or other UI pieces) to subscribe to the new/updated events on the `eventBus` (e.g., `KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED`, `KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED`) to update their display.
    *   Ensure UI elements dependent on `isOutputAudioBufferActive` subscribe to `KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED`.

**Acceptance Criteria:**

*   The XState machine's `processAndRelayServerMessage` is the sole entry point for RTC message interpretation.
*   All relevant information from server messages is broadcasted as specific, typed events on the `eventBus`.
*   `useHandleServerEvent.ts` is significantly refactored or removed, with its responsibilities redistributed to the XState machine (for event emission) and dedicated hooks/services (for function execution, transcript updates via event bus subscription).
*   The `useEffect` in `AppContents` for `lastServerMessage` is removed.
*   Application correctly processes and displays all server communications (transcripts, VAD, function calls, agent transfers) based on the new event flow. 
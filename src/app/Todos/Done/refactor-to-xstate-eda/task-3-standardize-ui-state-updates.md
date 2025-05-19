### Task 3: Standardize UI State Updates via Event Bus - **COMPLETED**

**Objective:**
Ensure that all UI state within components (especially in `src/app/App.tsx` within the `AppContents` function and its children) that changes in reaction to agent lifecycle events or server-sent information is updated consistently by subscribing to specific events on the `eventBus`. These `eventBus` events should originate from the `agentLifecycleMachine`.

**Rationale:**
Standardizing to an event bus-driven approach for reactive UI updates promotes decoupling: UI components listen for meaningful domain events rather than being tightly coupled to the internal workings of other hooks or the exact structure of the XState context. This makes the UI more reactive to the system's state changes in a consistent manner.

**Summary of Completion:**
*   All identified reactive UI states in `AppContents` (`src/app/App.tsx`) are now updated via the `eventBus`.
*   `userResponseSuggestions`: Now cleared based on `KatoEvents.AGENT_SWITCH_COMPLETED`.
*   `isFunctionCallInProgress`: Now managed by `KatoEvents.TOOL_CALL_STARTED` and `KatoEvents.TOOL_CALL_COMPLETED`.
*   `micAccessError`: Newly identified and refactored to be driven by `KatoEvents.MICROPHONE_ACCESS_ERROR` and `KatoEvents.MICROPHONE_ACCESS_RECOVERED`.
*   Previously event-driven states (`isOutputAudioBufferActive`, `showMicDeniedModal`, `audioInputMode`) were confirmed to be correctly implemented.
*   Transcript data updates via `useTranscript` were verified to be event-driven through `eventBus` subscriptions in `TranscriptContext.tsx`.
*   The XState machine (`katoAgentLifecycleMachine.ts`) and `useToolExecutor.ts` have been updated to emit and handle the necessary events.

**Original Steps & How They Were Addressed:**

1.  **Identify Reactive UI State:**
    *   Review `AppContents` function in `src/app/App.tsx` and its child components.
    *   **Completed.** States identified and addressed:
        *   `isOutputAudioBufferActive` (Verified as already event-driven).
        *   `showMicDeniedModal` (Verified as already event-driven).
        *   `audioInputMode` (Verified as already event-driven).
        *   `userResponseSuggestions` (Refactored to be event-driven).
        *   `isFunctionCallInProgress` (Refactored to be event-driven).
        *   `micAccessError` (Identified during review and refactored to be event-driven).
        *   Transcript data (`useTranscript`) (Verified event-driven linkage via `TranscriptContext.tsx`).

2.  **Ensure XState Machine Emits Necessary Events:**
    *   **Completed.** The `katoAgentLifecycleMachine.ts` was updated:
        *   Confirmed `KatoEvents.AGENT_SWITCH_COMPLETED` is emitted for `userResponseSuggestions`.
        *   Added emission of `KatoEvents.TOOL_CALL_STARTED` when a function call is identified.
        *   Added internal events (`TOOL_EXECUTOR_SUCCESS`/`FAILURE`) and an action (`emitToolCallCompleted`) to emit `KatoEvents.TOOL_CALL_COMPLETED`.
        *   Added emission of `KatoEvents.MICROPHONE_ACCESS_ERROR` and `KatoEvents.MICROPHONE_ACCESS_RECOVERED`.
        *   Verified existing transcript-related events are emitted.

3.  **Refactor UI Components/Hooks to Subscribe to `eventBus` Events:**
    *   **Completed.** In `AppContents` function in `src/app/App.tsx`:
        *   Added listener for `KatoEvents.AGENT_SWITCH_COMPLETED` to clear `userResponseSuggestions`.
        *   Added listeners for `KatoEvents.TOOL_CALL_STARTED` and `KatoEvents.TOOL_CALL_COMPLETED` to manage `isFunctionCallInProgress`.
        *   Added listeners for `KatoEvents.MICROPHONE_ACCESS_ERROR` and `KatoEvents.MICROPHONE_ACCESS_RECOVERED` to manage `micAccessError`.
    *   `useToolExecutor.ts` was updated to emit `TOOL_EXECUTOR_SUCCESS`/`FAILURE` events back to the machine via the event bus.
    *   `TranscriptContext.tsx` was verified to correctly subscribe to transcript-related `eventBus` events.

4.  **Remove Direct State Manipulations:**
    *   **Completed.** Direct state manipulations for `userResponseSuggestions` (in `handleAgentSelection`) and `isFunctionCallInProgress` (in `sendMessage`) were removed from `AppContents`.

**Acceptance Criteria:** - **MET**

*   UI state for `userResponseSuggestions`, `isFunctionCallInProgress`, and `micAccessError` in `AppContents` (in `src/app/App.tsx`) is updated by subscribing to events from the `eventBus`.
*   Direct state setting for these states from component methods (like `handleAgentSelection`, `sendMessage`) is eliminated.
*   The `useTranscript` hook (via `TranscriptContext.tsx`) correctly updates transcript data based on `eventBus` events originating from the XState machine.
*   The UI remains responsive and accurately reflects the application state as orchestrated by the XState machine and communicated via the `eventBus` (pending final testing, but logical flow established). 
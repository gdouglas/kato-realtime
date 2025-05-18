### Task 3: Standardize UI State Updates via Event Bus

**Objective:**
Ensure that all UI state within components (especially in `AppContents.tsx` and its children) that changes in reaction to agent lifecycle events or server-sent information is updated consistently by subscribing to specific events on the `eventBus`. These `eventBus` events should originate from the `agentLifecycleMachine`.

**Rationale:**
Currently, some UI state might be updated directly by hooks (like `useHandleServerEvent` calling `setIsOutputAudioBufferActive`) or based on observing the XState machine's context directly in `AppContents`. Standardizing this to an event bus-driven approach for reactive UI updates promotes decoupling: UI components listen for meaningful domain events rather than being tightly coupled to the internal workings of other hooks or the exact structure of the XState context. This makes the UI more reactive to the system's state changes in a consistent manner.

**Steps:**

1.  **Identify Reactive UI State:**
    *   Review `AppContents.tsx` and its child components for local React state that changes based on the agent's lifecycle or information from the server.
    *   Examples identified:
        *   `isOutputAudioBufferActive` (in `AppContents.tsx`)
        *   `showMicDeniedModal` (already correctly driven by `KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED` from the bus - serve as a good example).
        *   `audioInputMode` (already correctly driven by `KatoEvents.AUDIO_INPUT_MODE_CHANGED` from the bus).
        *   Transcript data displayed in `Transcript.tsx` (will be covered by Task 2, ensuring it listens to bus events like `KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED`, etc.).
        *   Potentially `userResponseSuggestions` if these are meant to be cleared/updated based on agent changes or specific server messages.

2.  **Ensure XState Machine Emits Necessary Events:**
    *   For each piece of identified reactive UI state, confirm that the `agentLifecycleMachine` (primarily through its `processAndRelayServerMessage` action or other lifecycle actions) emits a clear, specific event onto the `eventBus` when that state should change.
    *   Example: `KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED` is already emitted by the machine for `isOutputAudioBufferActive`.
    *   If `userResponseSuggestions` should clear when an agent switches, the machine could emit an `AGENT_SWITCH_COMPLETED` event, and `AppContents` could listen to this to clear the suggestions.

3.  **Refactor UI Components to Subscribe to `eventBus` Events:**
    *   In `AppContents.tsx` or relevant child components/hooks:
        *   Use `useEffect` and `useEventBus()` to subscribe to the appropriate events from the `eventBus`.
        *   The callback for the event subscription should update the local React state (`useState`).
        *   Ensure to return a cleanup function from `useEffect` to unsubscribe from the event bus when the component unmounts or dependencies change.
    *   Example (for `isOutputAudioBufferActive` in `AppContents`):
        ```typescript
        // In AppContents.tsx
        const eventBus = useEventBus();
        const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState(false);

        useEffect(() => {
          const handleAudioBufferStatus = (isActive: boolean) => {
            setIsOutputAudioBufferActive(isActive);
          };
          const unsubscribe = eventBus.on(KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED, handleAudioBufferStatus);
          return () => unsubscribe();
        }, [eventBus]);
        ```
    *   This replaces direct imperative calls like `setIsOutputAudioBufferActive(true)` from other hooks (e.g., `useHandleServerEvent`).

4.  **Remove Direct State Manipulations from Other Hooks:**
    *   As part of Task 2, direct state manipulations (like `setIsOutputAudioBufferActive`) will be removed from `useHandleServerEvent`. This task ensures the UI correctly picks up these changes via the event bus.

**Acceptance Criteria:**

*   UI state in `AppContents` and child components that reflects server information or lifecycle changes is updated by subscribing to events from the `eventBus`.
*   Direct state setting from hooks like `useHandleServerEvent` into `AppContents` (or other components) is eliminated for these states.
*   The UI remains responsive and accurately reflects the application state as orchestrated by the XState machine and communicated via the `eventBus`. 
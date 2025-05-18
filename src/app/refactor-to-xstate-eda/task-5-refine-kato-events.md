### Task 5: Review and Refine Event Definitions (`KatoEvents`)

**Objective:**
Ensure that the `KatoEvents` (events used with the `eventBus`) are comprehensive, clearly named, and represent meaningful domain/application-level events. Document the purpose and payload of each event.

**Rationale:**
As the primary means of decoupled communication between the XState machine and other parts of the application (like UI components or other services), the clarity and design of `eventBus` events are crucial. Well-defined events improve code readability, make it easier to understand system interactions, and simplify debugging and future extensions.

**Steps:**

1.  **Collect All Event Types:**
    *   List all event types currently defined or planned for `KatoEvents` (e.g., in `src/app/cases/kato/KatoEvents.ts`).
    *   Include events identified during Task 2 (Centralize Server Message Processing) that the XState machine will emit onto the `eventBus`.
        *   Examples from Task 2: `KatoEvents.SERVER_SESSION_CREATED`, `KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED`, `KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED`, `KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED`, `KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED`, `KatoEvents.SERVER_FUNCTION_CALL_REQUESTED`, `KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE`.
    *   Include existing events like: `KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED`, `KatoEvents.USER_SPEECH_STARTED`, `KatoEvents.USER_SPEECH_STOPPED`, `KatoEvents.SHOW_MIC_DENIED_MODAL_REQUESTED`, `KatoEvents.AUDIO_INPUT_MODE_CHANGED`, `KatoEvents.AGENT_SWITCH_STARTED`, `KatoEvents.AGENT_SWITCH_COMPLETED`, `KatoEvents.AGENT_SWITCH_FAILED`, `KatoEvents.CURRENT_AGENT_CHANGED` (review if this is still needed if UI derives current agent from machine context).

2.  **Review Naming Conventions:**
    *   Ensure a consistent naming convention (e.g., `NOUN_VERB_STATUS` or `DOMAIN_EVENT_DESCRIPTION`).
    *   Names should be descriptive and clearly indicate the event's purpose.
    *   Example: `SERVER_TRANSCRIPT_ITEM_CREATED` is good. `OUTPUT_AUDIO_BUFFER_STATUS_CHANGED` is also clear.

3.  **Define Payloads:**
    *   For each event, clearly define the expected data payload (if any).
    *   Use TypeScript interfaces or types for these payloads to ensure type safety for event producers and consumers.
    *   Example:
        ```typescript
        // In KatoEvents.ts or a types file
        export interface ServerTranscriptItemCreatedPayload {
          itemId: string;
          role: 'user' | 'assistant';
          initialText: string;
          timestamp: number;
        }

        // In EventBus.ts or KatoEvents.ts
        // EventBus.emit(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, payload: ServerTranscriptItemCreatedPayload);
        // EventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, (data: ServerTranscriptItemCreatedPayload) => { ... });
        ```

4.  **Document Events:**
    *   In `src/app/cases/kato/KatoEvents.ts` (or wherever `KatoEvents` are defined/exported):
        *   Add comments explaining the purpose of each event.
        *   Describe when each event is typically emitted and what part of the system might consume it.
        *   Reference the payload type.

5.  **Consolidate/Remove Redundant Events:**
    *   Check for any events that might be redundant or whose purpose is now covered by direct XState machine state observation or other, more specific events.
    *   For example, if `useAgentManager` was emitting `AGENT_SWITCH_STARTED` etc., and now the UI observes `agentLifecycle.isSwitchingInProgress` and `agentLifecycle.error`, these specific bus events might be less critical unless other non-UI modules need them.

**Acceptance Criteria:**

*   A clear, documented list of `KatoEvents` exists.
*   Events have consistent and descriptive names.
*   Payloads for events are well-defined using TypeScript types/interfaces.
*   The `eventBus` is used with these typed events, enhancing type safety.
*   Redundant or unnecessary events are removed. 
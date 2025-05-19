### Task 6: Testing and Verification

**Objective:**
Thoroughly test all aspects of the agent lifecycle, RTC communication, and UI interactivity after the refactoring to ensure the system behaves correctly, is robust, and all changes have been integrated successfully.

**Rationale:**
The refactoring involves significant changes to state management, event flow, and message processing. Comprehensive testing is crucial to catch any regressions, confirm that the new architecture works as intended under various scenarios, and validate that the user experience remains seamless.

**Steps:**

1.  **Unit/Integration Testing (as applicable):**
    *   **XState Machine:** If not already in place, consider writing tests for critical parts of the `agentLifecycleMachine` logic, especially complex transitions, guard conditions, and actor invocations. XState's testing utilities can be helpful here.
    *   **Event Emitters/Handlers:** Test that the XState machine correctly emits expected events onto the `eventBus` in response to specific RTC messages or internal transitions.
    *   Test that UI components or hooks subscribing to `eventBus` events react appropriately and update their state/display as intended.
    *   Test any new services/hooks created (e.g., for tool/function execution).

2.  **End-to-End (E2E) Scenario Testing:**
    *   **Agent Selection and Initialization:**
        *   Test selecting an agent for the first time.
        *   Test selecting an agent when another is already active (switching).
        *   Verify correct intro audio playback (including scenarios requiring user interaction for autoplay).
        *   Verify correct welcome messages and initial state upon connection.
    *   **RTC Connection Lifecycle:**
        *   Test successful connection to an agent.
        *   Test manual disconnection by the user.
        *   Simulate or test scenarios of unexpected disconnections (e.g., network issues, server-side termination) and verify the machine transitions to appropriate error/idle states.
        *   Test the `RETRY` functionality from error states.
    *   **Server Message Processing:**
        *   Verify real-time transcript updates for both user and assistant messages (including deltas and final messages).
        *   Test VAD event handling (UI reacting to user speech started/stopped if applicable).
        *   Test server-initiated agent transfers (`SERVER_REQUESTED_AGENT_TRANSFER`).
        *   Test function call requests from the server, their execution by the client (new tool executor), and the result being sent back (if applicable).
        *   Verify guardrail processing and display, if part of the server message flow.
    *   **UI Interactivity:**
        *   Confirm all UI controls (agent selection dropdown, connect/disconnect button, microphone controls if any) correctly interact with the XState machine or reflect its state.
        *   Verify UI feedback during state transitions (e.g., loading indicators during agent switching/connecting).
        *   Check modal dialogs (e.g., microphone denied modal) appear when expected.
    *   **Error Handling:**
        *   Test various error conditions: token fetch failure, RTC setup failure, intro playback failure, agent switch failure.
        *   Ensure appropriate error messages are displayed or logged, and the system remains in a stable state.

3.  **Cross-Browser/Device Testing (if applicable):**
    *   Perform testing on target browsers to ensure consistency, especially for WebRTC and audio playback features.

4.  **Review Logs and Developer Tools:**
    *   Monitor console logs for any new errors or unexpected warnings.
    *   Use browser developer tools to inspect component state, network requests, and XState machine transitions (if using XState dev tools) to aid debugging.

**Acceptance Criteria:**

*   All previously functional aspects of the application related to agent interaction and RTC communication continue to work correctly.
*   The refactored event flow (UI -> XState -> EventBus -> UI/Services) is demonstrably working.
*   State transitions in the XState machine are logical and correctly reflect the application's operational state.
*   Error handling is robust, and the system recovers gracefully or provides clear feedback.
*   No new regressions are introduced. 
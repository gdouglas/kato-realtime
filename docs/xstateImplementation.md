# XState Refactor: Agent Lifecycle Management

## 1. Goals of the Refactor

The primary goal of this refactor is to replace the existing implicit state management for agent switching and WebRTC connection logic with a more robust and explicit state machine using XState. This aims to achieve the following:

*   **Clearer State Transitions:** Make it easier to understand and follow how the application moves between states like "idle," "connecting," "agent active," "preparingToSwitch," "disconnectingForSwitch," "activatingAgent," "playingIntro," and various error/recovery states.
*   **Centralized Logic:** Consolidate the logic for these complex processes (previously spread across React Context, custom hooks like `useAgentManager`, `useKatoRTC`, `useIntroAudio`, and the `EventBusContext`) into the single `agentLifecycleMachine`.
*   **Reduced Race Conditions:** Minimize potential race conditions by having a single source of truth and well-defined, predictable state transitions.
*   **Improved Maintainability & Debuggability:** Make the agent lifecycle logic easier to reason about, debug, test, and extend in the future.
*   **Self-Contained Actors:** Ensure XState actors (e.g., for RTC connection, disconnection, intro playback) are largely self-contained, managing their own operations and communicating with the machine via events.

## 2. Files in Scope

The following files are key to this refactor:

*   **State Machine Definition:**
    *   `src/app/machines/katoAgentLifecycleMachine.ts`: Contains the XState machine definition, including its context, events, actions, actors (services), and guards.
*   **React Context for XState:**
    *   `src/app/contexts/AgentLifecycleContext.tsx`: Provides the XState machine (actorRef, snapshot, send function) to the React component tree.
*   **Main Application Component (Consumer):**
    *   `src/app/App.tsx`: The primary consumer of the `AgentLifecycleContext`. It will use the machine's state and send events to drive the agent lifecycle.
*   **Hooks & Utilities (being refactored/integrated):**
    *   `src/app/hooks/useKatoRTC.ts`: Originally handled WebRTC logic. Parts are being moved into XState actors, and the hook itself will increasingly rely on or send events to the XState machine.
    *   `src/app/hooks/useHandleServerEvent.ts`: Handles messages from the server; now sends `SERVER_REQUESTED_AGENT_TRANSFER` to the machine.
    *   `src/app/lib/eventBus.ts`: The existing event bus. Its usage for agent lifecycle events should diminish as XState takes over.
    *   `src/app/contexts/EventBusContext.tsx`: Provider for the event bus.
*   **Supporting UI Components (indirectly affected via App.tsx):**
    *   `src/app/components/Transcript.tsx`: User interface for displaying messages and sending user input. Interacts with `App.tsx`.
    *   Other UI components in `src/app/components/` that control or display agent/session status.

## 3. Success Criteria

The refactor will be considered successful when:

1.  **Full XState Orchestration:** The `agentLifecycleMachine` fully orchestrates the agent selection, connection (including token fetching and RTC setup), intro audio playback (if applicable), active session state, and agent switching processes.
2.  **Old Logic Replaced/Removed:** The previous state management logic for these processes in `useKatoRTC`, `App.tsx` (e.g., `useState` for `sessionStatus`, `selectedAgentName`, `currentAgentConfig`), and direct event bus emissions for lifecycle control are significantly reduced or eliminated.
3.  **Correct State Representation:** The application UI accurately reflects the current state of the `agentLifecycleMachine` (e.g., correctly showing "connecting," "connected," "disconnected," "error" states, and the active agent).
4.  **Functional Equivalence:** All core functionalities related to agent lifecycle work as before or better:
    *   Users can select an agent.
    *   The application connects to the selected agent.
    *   Intro audio plays correctly for agents that have it (and is skipped if already played or not present).
    *   Users can manually disconnect.
    *   The system can gracefully handle connection errors and offer retry mechanisms.
    *   Agent switching (user-initiated or server-initiated) works reliably, including disconnecting from the current agent, playing the new agent's intro (if needed), and connecting to the new agent.
    *   Server-initiated agent transfers are handled correctly.
5.  **Error Handling:** The XState machine correctly transitions to defined error states upon failures (e.g., token fetch failure, RTC connection failure, intro playback error), and the UI reflects these errors appropriately. Retry mechanisms from error states function as expected.
6.  **No Regressions:** No new bugs or regressions are introduced in other parts of the application as a result of this refactor.
7.  **Improved Code Clarity:** The state management logic is demonstrably easier to understand and follow compared to the previous implementation.

## 4. Tests to Validate Implementation

### Manual (End-to-End) Tests:

These tests should be performed in the browser, observing UI changes, console logs (including XState logs/breadcrumbs), and network activity.

1.  **Initial Agent Selection & Connection:**
    *   **T1.1:** Select an agent from the UI.
        *   *Expected:* Machine transitions: `idle` -> `preparingToSwitch` -> `activatingAgent` -> (`playingIntro` if applicable) -> `connecting` -> `agentActive`. RTC connection established. UI shows "Connected" and the correct agent. Intro audio plays if new.
    *   **T1.2:** Select an agent that has no intro audio.
        *   *Expected:* `playingIntro` state is skipped. Connection proceeds directly.
    *   **T1.3:** Select an agent whose intro has already been played in the session.
        *   *Expected:* `playingIntro` state is skipped.
2.  **Manual Disconnection:**
    *   **T2.1:** While connected, click the "Disconnect" button.
        *   *Expected:* Machine transitions: `agentActive` -> `disconnectingManually` -> `idle`. RTC connection closed. UI shows "Disconnected."
3.  **Agent Switching (User-Initiated):**
    *   **T3.1:** While connected to Agent A, select Agent B (with intro).
        *   *Expected:* `agentActive` -> `disconnectingForSwitch` (RTC for A closes) -> `activatingAgent` (for B) -> `playingIntro` (for B) -> `connecting` (to B) -> `agentActive` (B).
    *   **T3.2:** While connected to Agent A, select Agent B (no intro, or intro already played).
        *   *Expected:* `playingIntro` for B is skipped.
4.  **Agent Switching (Server-Initiated):**
    *   **T4.1:** Simulate a server message requesting a transfer to Agent C (with intro) while connected to Agent A.
        *   *Expected:* Same transition flow as T3.1, but triggered by `SERVER_REQUESTED_AGENT_TRANSFER` event.
5.  **Connection Error Handling:**
    *   **T5.1:** Simulate a failure during token fetching (e.g., API returns 500).
        *   *Expected:* Machine transitions to `connectionError` (or specific error state for token fetch if defined). UI shows error. "Retry" option works and re-attempts connection from `connecting`.
    *   **T5.2:** Simulate RTC connection failure (e.g., `createRealtimeConnection` throws an error or `dc.onerror` fires before `onopen`).
        *   *Expected:* Machine transitions to `connectionError`. UI shows error. "Retry" option works.
6.  **Intro Playback Error Handling:**
    *   **T6.1:** Simulate a failure during intro audio fetch or playback.
        *   *Expected:* Machine transitions to `errorIntroFailed`. UI shows error. "Retry" attempts `playingIntro` again. "Cancel" or selecting a new agent transitions to `idle`.
7.  **Unexpected RTC Disconnect:**
    *   **T7.1:** While in `agentActive`, simulate an unexpected data channel close (not manual or switch-related).
        *   *Expected:* Machine transitions to `connectionError`. UI shows error.
8.  **Rapid Agent Switching:**
    *   **T8.1:** Quickly select Agent A, then Agent B, then Agent C before connections fully complete.
        *   *Expected:* The machine should handle these transitions gracefully, cancelling in-flight operations and eventually settling on the last selected agent.
9.  **Cancel Switch:**
    *   **T9.1:** While an agent switch is in progress (e.g., in `playingIntro` or `connecting`), trigger a `CANCEL_SWITCH` (if a UI element for this exists or can be simulated).
        *   *Expected:* Machine transitions to `idle`, cleaning up any resources.

This document should provide a good overview and guide for the refactoring process.

### Task 1: Consolidate Agent Lifecycle Management into XState Machine

**Objective:**
Transition all agent lifecycle management logic, currently partially handled by `useAgentManager.ts`, to be exclusively managed by the `agentLifecycleMachine`. This involves removing `useAgentManager.ts` and updating UI components to interact directly with the XState machine via `useAgentLifecycle`.

**Rationale:**
`useAgentManager.ts` duplicates state (e.g., `selectedAgentName`, `isSwitchingInProgress`, `playedAgentIntros`) and lifecycle orchestration logic (agent selection, intro handling, connection sequencing) that is already, or should be, within the purview of `agentLifecycleMachine`. Centralizing this in XState will create a single source of truth, reduce complexity, and prevent potential conflicts or inconsistencies.

**Steps:**

1.  **Identify `useAgentManager.ts` Responsibilities:**
    *   Status: COMPLETED
    *   Note: Responsibilities were identified, and this understanding guided the refactoring.
    *   Thoroughly review `useAgentManager.ts` to list all state it manages and all lifecycle events/sequences it orchestrates (e.g., handling `KatoEvents.USER_SELECTED_AGENT`, deciding when to disconnect, when to activate an agent, when to request intro play, when to request connection).

2.  **Verify XState Machine Coverage:**
    *   Status: COMPLETED
    *   Note: `agentLifecycleMachine.ts` was confirmed to cover or was updated to cover all necessary lifecycle aspects, including event emissions for UI state synchronization.
    *   Cross-reference the identified responsibilities with the existing states, events, actions, and actors in `agentLifecycleMachine.ts`. Most functionalities (like agent selection, intro playback via actor, connection via actor, disconnect via actor, tracking `sessionStatus`, `currentAgentConfig`) are already present.
    *   Identify any minor gaps, if they exist, and plan to incorporate them into the XState machine if necessary (though it's likely comprehensive).

3.  **Update UI Components (e.g., `AppContents` and its children):**
    *   Status: COMPLETED
    *   Note: `AgentContext.tsx` was refactored to derive its state from `useAgentLifecycle`. `SpeakPage.tsx` was reviewed and updated to correctly consume context and handle events like `CURRENT_AGENT_CHANGED`. Agent selection is correctly dispatched to the machine.
    *   **State Consumption:** Modify components that currently consume state from `useAgentManager.ts` (or derive it from events emitted by it) to get this state directly from `useAgentLifecycle().state.context` or the derived helper values (e.g., `agentLifecycle.currentAgentConfig`, `agentLifecycle.isSwitchingInProgress`, `agentLifecycle.sessionStatus`).
    *   **Event Dispatch:** Change UI elements that trigger agent lifecycle actions (e.g., an agent selection dropdown in `AppContents` which currently emits `KatoEvents.USER_SELECTED_AGENT` to the event bus for `useAgentManager` to pick up). These elements should now directly send the appropriate event to the XState machine using `agentLifecycle.send({ type: 'SELECT_AGENT', agentName: '...' })`.
    *   Specifically, the `handleAgentSelection` function in `AppContents.tsx` already correctly sends `SELECT_AGENT` to the machine. Ensure any other user-driven lifecycle actions follow this pattern.

4.  **Remove `useAgentManager.ts`:**
    *   Status: COMPLETED
    *   Note: The file `src/app/hooks/useAgentManager.ts` has been deleted from the project.
    *   Once all its functionalities are confirmed to be handled by the XState machine and UI components are updated, delete the `src/app/hooks/useAgentManager.ts` file.
    *   Remove any imports or usages of `useAgentManager` from other files (primarily `AppContents.tsx`).

5.  **Reconcile Local State in `AppContents`:**
    *   Status: COMPLETED
    *   Note: `SpeakPage.tsx` (acting as the primary content view) was reviewed. Its local state and event handling related to agent lifecycle are now driven by `useAgentLifecycle` and events from the XState machine.
    *   Review any remaining local state in `AppContents.tsx` that might have been set based on events or logic from `useAgentManager`. Ensure this state is now correctly driven by data from `useAgentLifecycle` or by subscribing to events on the `eventBus` that originate from the XState machine.

**Acceptance Criteria:**

*   `useAgentManager.ts` is removed from the codebase.
    *   Status: COMPLETED
*   Agent selection, intro playback, connection, and disconnection are fully orchestrated by `agentLifecycleMachine`.
    *   Status: COMPLETED
*   UI components correctly reflect the state of the `agentLifecycleMachine` and send events directly to it for lifecycle operations.
    *   Status: COMPLETED
*   The application behaves as expected for all agent lifecycle scenarios (initial selection, switching agents, reconnecting, error states). 
    *   Status: COMPLETED 
## Refactor Purpose and Goals

The primary goal of this refactor is to fully leverage the `agentLifecycleMachine` (XState) as the central orchestrator for all aspects of the agent lifecycle, Real-Time Communication (RTC) interactions, and server message processing within the application.

This initiative aims to:

1.  **Centralize State Management:** Consolidate all lifecycle-related state (e.g., selected agent, connection status, switching progress, intro playback) within the `agentLifecycleMachine`. This eliminates state duplication currently present in hooks like `useAgentManager`.
2.  **Streamline Event Flow:** Establish a clear, unidirectional event flow. UI interactions will send events directly to the XState machine. The machine will process these, manage side effects (like API calls or RTC actions), and then emit processed, domain-specific events onto a shared `eventBus`. Other application modules (UI components, hooks) will subscribe to this `eventBus` for updates.
3.  **Decouple Components:** Reduce direct dependencies between components and hooks by having them communicate primarily through the XState machine (for commands/inputs) and the `eventBus` (for reactive updates/outputs).
4.  **Simplify Server Message Handling:** Make the `agentLifecycleMachine` (specifically its `processAndRelayServerMessage` action) the single point of entry for parsing and interpreting messages received via the RTC data channel. This will remove redundant processing logic in hooks like `useHandleServerEvent`.
5.  **Enhance Maintainability and Predictability:** By centralizing the complex state logic and event orchestration in XState, the overall architecture will become easier to understand, debug, and extend.

The outcome of this refactor will be a more robust, streamlined, and maintainable event-driven architecture, with the XState machine acting as the definitive source of truth for agent-related state and lifecycle events.

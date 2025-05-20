| File/Module | Purpose/Role |
|----------------------------|---------------------------------------------------------------------------------------------|
| eventBus.ts | Core event emitter for decoupled communication |
| EventBusContext.tsx | Makes the event bus available throughout the React tree |
| KatoEvents.ts | Central registry of all event names (constants) |
| KatoEventPayloads.ts | TypeScript interfaces for event payloads |
| EventContext.tsx | Context for logging/displaying events (for debugging/monitoring) |
| Events.tsx | UI component to display the event log |
| katoAgentLifecycleMachine.ts | XState machine that emits/listens for events via the EventBus, manages agent lifecycle, etc. |
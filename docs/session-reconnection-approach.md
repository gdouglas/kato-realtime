# Session Reconnection Approach for Agent Voice Switching

## Overview

This document outlines the implementation plan for the "Session Reconnection Approach" to handle voice switching between different agents in the Realtime Kato application. The current limitation in the OpenAI Realtime API prevents changing a session's voice while assistant audio is present. This approach addresses this limitation by disconnecting and reconnecting the WebRTC session when switching between agents, while maintaining conversation context and state.

## Core Concept

Instead of maintaining multiple simultaneous connections or using a single voice for all agents, we will:

1. Disconnect the current WebRTC session when switching agents
2. Preserve conversation context in client-side storage
3. Establish a new WebRTC connection with the appropriate voice setting
4. Inject relevant context from the previous conversation
5. Resume the conversation with the new agent/voice

This approach provides distinct voice identities for each agent while maintaining conversation coherence and context.

## Architecture Components

### 1. Enhanced State Management

- Extended `TranscriptContext` to include agent-specific conversation history
- Client-side persistence layer for conversation state
- Context selection and assembly logic for session transitions

### 2. Session Lifecycle Management

- Clean disconnection process with resource cleanup
- Connection establishment with context injection
- Transition UI indicators for seamless user experience

### 3. Context Preservation Strategy

- Separate storage for preceptor and patient interactions
- Smart context assembly algorithms
- Token limit management with prioritization logic

### 4. LocalStorage Integration

- Compression and encryption for large conversations
- Versioning for future compatibility
- Error handling and corruption detection

## Benefits

1. **Resource Efficiency**: Only one WebRTC connection active at a time
2. **Voice Differentiation**: Each agent has a distinct voice identity
3. **Context Preservation**: Conversation coherence maintained across transitions
4. **Resilience**: State persistence survives page reloads and browser refreshes

## Technical Challenges

1. **Transition UX**: Brief interruption during reconnection (1-2 seconds)
2. **Context Assembly**: Ensuring relevant information is preserved across transitions
3. **Token Management**: Preventing context overflow with large conversations
4. **Browser Limitations**: LocalStorage size constraints (5-10MB typical)

## Implementation Plan

See individual feature documents for detailed implementation plans:

- [Conversation State Management](./features/conversation-state-management.md)
- [Session Reconnection Handler](./features/session-reconnection-handler.md)
- [Context Assembly Engine](./features/context-assembly-engine.md)
- [LocalStorage Persistence](./features/localstorage-persistence.md)
- [Transition User Experience](./features/transition-ux.md)

## Key Files to Modify

1. `src/app/App.tsx` - Core session management
2. `src/app/contexts/TranscriptContext.tsx` - Enhanced state management
3. `src/app/hooks/useHandleServerEvent.ts` - Agent transition logic
4. `src/app/types.ts` - New type definitions
5. New utility files for context assembly and persistence

## Next Steps

See the [implementation-plan.md](./implementation-plan.md) document for a detailed task breakdown and timeline. 
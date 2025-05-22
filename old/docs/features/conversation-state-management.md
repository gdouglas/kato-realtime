# Conversation State Management

## Overview

The Conversation State Management feature extends the current transcript management to support agent-specific conversation histories and context preservation during agent transitions. This is a foundational component for enabling the session reconnection approach.

## Current Implementation

Currently, the application uses a `TranscriptContext` (in `src/app/contexts/TranscriptContext.tsx`) to manage a single, linear conversation history. This context provides:

- `transcriptItems`: Array of all conversation items
- `addTranscriptMessage`: Add a new message to the transcript
- `updateTranscriptMessage`: Update an existing message
- `addTranscriptBreadcrumb`: Add system notes to the transcript

This implementation doesn't distinguish between different agents in the conversation history, which is required for the session reconnection approach.

## Proposed Changes

### 1. Extended Transcript State

We will enhance the `TranscriptContext` to include agent-specific conversation tracking:

```typescript
interface EnhancedTranscriptState {
  // Original transcript items (for UI display)
  transcriptItems: TranscriptItem[];
  
  // Agent-specific conversation histories
  agentConversations: {
    [agentName: string]: TranscriptItem[];
  };
  
  // Track which messages are shared across agents (user messages, critical info)
  sharedMessages: Set<string>; // Set of message IDs
  
  // Current active agent
  currentAgent: string;
  
  // Track timestamps for conversation restoration
  lastTransitionTime: number;
}
```

### 2. Enhanced Context Provider

The `TranscriptProvider` component will be extended with new capabilities:

- `addAgentSpecificMessage`: Record a message in a specific agent's conversation history
- `markMessageAsShared`: Indicate a message should be shared across agent contexts
- `getConversationForAgent`: Retrieve the conversation history for a specific agent
- `prepareContextForAgent`: Assemble the appropriate context for a new session

### 3. Agent-Aware Message Management

New methods to support the agent transitions:

```typescript
// Add a message specific to an agent
function addAgentSpecificMessage(
  itemId: string, 
  agentName: string, 
  role: "user" | "assistant", 
  text: string
): void

// Get conversation context for an agent transition
function prepareContextForAgent(
  targetAgent: string, 
  maxTokens: number = 4000
): { messages: Array<{ role: string, content: string }> }
```

### 4. Conversation Context Assembly

Logic to assemble relevant context when switching between agents:

- For patient → preceptor: Include detailed patient interactions
- For preceptor → patient: Include only medically relevant information
- Implement token counting to prevent context overflow
- Prioritize recent interactions over older ones

## Integration Points

The enhanced `TranscriptContext` will integrate with:

1. **Session Reconnection Handler**: To provide appropriate context during reconnection
2. **LocalStorage Persistence**: To save and restore conversation state
3. **Context Assembly Engine**: To determine which elements of conversation history to include

## Implementation Steps

1. **Define New Type Interfaces** in `src/app/types.ts`:
   - `AgentConversation` type 
   - Extended `TranscriptContextValue` interface

2. **Enhance TranscriptProvider** in `src/app/contexts/TranscriptContext.tsx`:
   - Add agent-specific state tracking
   - Implement new methods for context manipulation
   - Maintain backwards compatibility with existing components

3. **Create Context Assembly Utilities** in `src/app/lib/contextAssembly.ts`:
   - Implement token counting functions
   - Define context assembly strategies for different agent transitions
   - Create prioritization algorithms for context pruning

## Technical Considerations

- **Memory Usage**: Duplicating conversation history will increase memory usage
- **Performance**: Context assembly may impact performance during transitions
- **Backward Compatibility**: Changes should not break existing components
- **Error Handling**: Robust recovery mechanisms for context assembly failures 
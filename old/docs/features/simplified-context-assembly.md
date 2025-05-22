# Simplified Context Assembly

## Overview

The Simplified Context Assembly component provides a straightforward approach to preserving conversation context during agent transitions. This implementation focuses on essential context preservation while avoiding unnecessary complexity in the initial phases.

## Design Principles

1. **Simplicity First**: Prioritize a working, reliable solution over complex context management
2. **Essential Context Only**: Preserve only the most critical conversation elements
3. **Reliability Over Completeness**: Ensure consistent behavior even if some context is lost
4. **Incremental Enhancement**: Design for future improvements without overcomplicating initial implementation

## Implementation Approach

### 1. Basic Context Preservation

The initial implementation will use a chronological approach to context preservation:

```typescript
function assembleBasicContext(
  transcriptItems: TranscriptItem[],
  maxItems: number = 10
): TranscriptItem[] {
  // Filter to include only MESSAGE type items (not breadcrumbs)
  const messageItems = transcriptItems.filter(item => 
    item.type === "MESSAGE" && !item.isHidden
  );
  
  // Sort by creation time (oldest first)
  const sortedItems = [...messageItems].sort(
    (a, b) => a.createdAtMs - b.createdAtMs
  );
  
  // Take the most recent N items
  return sortedItems.slice(Math.max(0, sortedItems.length - maxItems));
}
```

### 2. Agent-Aware Context Sharing

We'll track which agent created each message and use this to determine context relevance:

```typescript
function assembleAgentAwareContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  maxItems: number = 10
): TranscriptItem[] {
  // Always include user messages
  const userMessages = transcriptItems.filter(item => 
    item.type === "MESSAGE" && 
    item.role === "user" && 
    !item.isHidden
  );
  
  // Include messages from the target agent
  const agentMessages = transcriptItems.filter(item => 
    item.type === "MESSAGE" && 
    item.role === "assistant" && 
    item.agentName === targetAgent && 
    !item.isHidden
  );
  
  // Combine and sort chronologically
  const relevantItems = [...userMessages, ...agentMessages].sort(
    (a, b) => a.createdAtMs - b.createdAtMs
  );
  
  // Limit to recent messages
  return relevantItems.slice(Math.max(0, relevantItems.length - maxItems));
}
```

### 3. Context Formatting

Convert transcript items to a format suitable for the Realtime API:

```typescript
function formatContextForAPI(items: TranscriptItem[]): Array<{role: string, content: string}> {
  return items.map(item => ({
    role: item.role || "system",
    content: item.title || ""
  }));
}
```

## Integration with Session Reconnection

The context assembly will be integrated with the session reconnection process:

```typescript
async function switchToAgent(targetAgent: string): Promise<void> {
  // Get current transcript items
  const currentItems = transcriptContext.transcriptItems;
  
  // Assemble relevant context for target agent
  const relevantContext = assembleAgentAwareContext(
    currentItems,
    targetAgent,
    15 // Conservative limit to avoid token issues
  );
  
  // Format for API consumption
  const formattedContext = formatContextForAPI(relevantContext);
  
  // Pass to reconnection handler
  await initiateVoiceTransition(
    currentAgent,
    targetAgent,
    formattedContext,
    disconnectFromRealtime
  );
}
```

## Technical Considerations

### Message Selection Strategy

The initial implementation will use these simple rules for message selection:

1. Include all recent user messages
2. Include recent messages from the target agent (if returning to that agent)
3. Limit total messages to avoid hitting token limits
4. Maintain chronological order

### Token Count Management

For the initial implementation, we'll use a simple approach to token management:

1. Limit total messages rather than counting tokens
2. Use conservative limits (10-15 messages max)
3. Prioritize user messages when limits are exceeded

### Future Enhancements

This simplified approach is designed to be extended in Phase 4 with:

1. **Token Counting**: Actual token estimation rather than message counting
2. **Message Prioritization**: Smarter selection of which messages to keep
3. **Content Analysis**: Identifying key information in messages
4. **Summarization**: Potentially condensing long conversation histories

## Testing

The Simplified Context Assembly will be tested with:

1. **Unit Tests**: Verify message selection and formatting logic
2. **Integration Tests**: Ensure context is properly passed during reconnection
3. **Edge Cases**: Test with empty contexts, long messages, and special characters

## Dependencies

- TranscriptContext (for accessing conversation history)
- Session Reconnection Handler (for initiating transitions)
- types.ts (for TypeScript type definitions) 
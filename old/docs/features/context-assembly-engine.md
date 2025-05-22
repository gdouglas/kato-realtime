# Context Assembly Engine

## Overview

The Context Assembly Engine is responsible for intelligently selecting, prioritizing, and formatting conversation history to maintain coherent context during agent transitions. This component plays a critical role in ensuring that conversations remain fluid and natural despite session reconnections.

## Functionality

The Context Assembly Engine handles these key tasks:

1. **Selecting Relevant History**: Determining which parts of the conversation history should be included when transitioning between agents.
2. **Token Management**: Ensuring context doesn't exceed API token limits.
3. **Priority-Based Pruning**: When context exceeds limits, intelligently prioritize which content to preserve.
4. **Context Formatting**: Properly format the context for injection into the new session.

## Key Components

### 1. Context Selection Strategies

Different agents may require different context. The engine implements strategies for:

#### Agent-Specific Selection Logic

```typescript
function selectContextForAgent(
  targetAgent: string,
  conversationState: ConversationState
): TranscriptItem[] {
  switch (targetAgent) {
    case "preceptor":
      return selectContextForPreceptor(conversationState);
    case "mrKato":
      return selectContextForPatient(conversationState);
    default:
      return selectDefaultContext(conversationState);
  }
}
```

#### Preceptor Context Strategy

Preceptors need comprehensive history to provide proper guidance:

```typescript
function selectContextForPreceptor(conversationState: ConversationState): TranscriptItem[] {
  return [
    // Include system context about the preceptor's role
    ...getPreceptorSystemContext(),
    
    // Include all patient-student interactions
    ...conversationState.patientMessages,
    
    // Include preceptor's previous messages for continuity
    ...conversationState.preceptorMessages,
    
    // Add transition indicator
    createSystemMessage("The student has been speaking with the patient and is now returning to you for guidance.")
  ];
}
```

#### Patient Context Strategy

Patients need medical context but not educational guidance:

```typescript
function selectContextForPatient(conversationState: ConversationState): TranscriptItem[] {
  // Extract only medically relevant information from preceptor conversations
  const relevantPreceptorContext = extractMedicallyRelevantInfo(
    conversationState.preceptorMessages
  );
  
  return [
    // Include system context about the patient's role and condition
    ...getPatientSystemContext(),
    
    // Include previous patient-student interactions
    ...conversationState.patientMessages,
    
    // Include only relevant preceptor context
    ...relevantPreceptorContext,
    
    // Add transition indicator
    createSystemMessage("The student is now speaking directly with you.")
  ];
}
```

### 2. Token Counting and Management

To prevent context overflow:

```typescript
function enforceTokenLimit(
  contextItems: TranscriptItem[],
  maxTokens: number = 4000
): TranscriptItem[] {
  // 1. Calculate token count
  const tokenCount = estimateTokenCount(contextItems);
  
  // 2. If within limits, return as is
  if (tokenCount <= maxTokens) {
    return contextItems;
  }
  
  // 3. Apply pruning strategy if over limit
  return pruneContextToFitTokenLimit(contextItems, maxTokens);
}
```

### 3. Priority-Based Pruning

When context needs to be reduced:

```typescript
function pruneContextToFitTokenLimit(
  contextItems: TranscriptItem[],
  maxTokens: number
): TranscriptItem[] {
  // 1. Assign priority categories
  const categorizedItems = categorizePriority(contextItems);
  
  // 2. Start with highest priority items
  let result = [...categorizedItems.critical];
  let currentTokens = estimateTokenCount(result);
  
  // 3. Add high priority items if space permits
  if (currentTokens + estimateTokenCount(categorizedItems.high) <= maxTokens) {
    result = [...result, ...categorizedItems.high];
    currentTokens = estimateTokenCount(result);
  } else {
    // Add as many as possible in chronological order
    // Logic to select subset of high priority items
  }
  
  // 4. Add medium priority items if space permits
  // Similar logic...
  
  // 5. Add low priority items if space permits
  // Similar logic...
  
  return result;
}
```

### 4. Context Formatting

Convert transcript items to OpenAI message format:

```typescript
function formatContextForOpenAI(
  contextItems: TranscriptItem[]
): Array<{role: string; content: string}> {
  return contextItems.map(item => {
    if (item.type === "MESSAGE") {
      return {
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.title || ""
      };
    } else if (item.type === "BREADCRUMB") {
      // Format breadcrumbs as system messages
      return {
        role: "system",
        content: item.title || ""
      };
    }
    // Default case
    return {
      role: "system",
      content: JSON.stringify(item)
    };
  });
}
```

## Implementation

### New Module: `src/app/lib/contextAssembly.ts`

This new module will contain:

1. **Context Selection Strategies**:
   - Agent-specific selection logic
   - Role-based content filtering

2. **Token Management**:
   - Token estimation functions
   - Token limit enforcement

3. **Priority-Based Pruning**:
   - Priority categorization
   - Selective content pruning

4. **Context Formatting**:
   - Conversion to API-compatible formats
   - System message generation

### Priority Categories

Messages will be categorized for pruning:

- **Critical**: System messages, current question, most recent exchanges
- **High**: Direct questions and their answers, medical information
- **Medium**: Contextual exchanges that provide background
- **Low**: Social exchanges, redundant information

## Integration Points

The Context Assembly Engine will integrate with:

1. **Conversation State Management**: To access the full conversation history
2. **Session Reconnection Handler**: To provide formatted context during reconnection
3. **Token Counting Utilities**: To enforce context limits

## Technical Considerations

- **Performance Optimization**: Context assembly should be efficient to minimize transition delay
- **Accuracy of Token Estimation**: Important for reliable context management
- **Medical Context Preservation**: Ensure critical medical information is never pruned
- **Conversation Coherence**: Maintain logical flow despite pruning 
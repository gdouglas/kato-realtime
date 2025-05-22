# Session Reconnection Handler

## Overview

The Session Reconnection Handler is responsible for managing the lifecycle of WebRTC connections during agent transitions. It handles the graceful termination of the current session, preparation for the new session with the appropriate voice, and establishment of a new connection while maintaining conversation continuity.

## Current Implementation

Currently, the application manages WebRTC connections in `src/app/App.tsx` with these key functions:

- `connectToRealtime()`: Establishes the initial WebRTC connection
- `disconnectFromRealtime()`: Terminates the WebRTC connection
- `updateSession()`: Updates session parameters (including voice)

The current implementation doesn't support reconnecting with a new voice while preserving context. When switching agents, it attempts to update the voice on the existing connection, which fails with the error: "Cannot update a conversation's voice if assistant audio is present."

## Proposed Solution

We will implement a specialized reconnection handler that:

1. Gracefully terminates the current session
2. Prepares context for the new agent
3. Establishes a new connection with the appropriate voice setting
4. Provides a smooth transition experience with appropriate UI feedback

## Key Components

### 1. Enhanced Agent Transition Flow

```typescript
async function switchAgent(targetAgent: string): Promise<void> {
  // 1. Show transition UI
  setTransitionState("preparing");
  
  // 2. Save current conversation state
  const conversationState = await saveConversationState();
  
  // 3. Prepare context for target agent
  const context = prepareContextForAgent(targetAgent);
  
  // 4. Disconnect current session gracefully
  await disconnectRealtimeSession();
  
  // 5. Show transition progress
  setTransitionState("connecting");
  
  // 6. Establish new connection with target agent voice
  await connectRealtimeSession({
    agentName: targetAgent,
    initialContext: context,
  });
  
  // 7. Update UI to reflect successful transition
  setTransitionState("connected");
  setCurrentAgent(targetAgent);
}
```

### 2. Graceful Session Termination

Enhanced disconnection logic to ensure proper cleanup:

```typescript
async function disconnectRealtimeSession(): Promise<void> {
  // 1. Attempt to cancel any in-progress responses
  await cancelAssistantSpeech();
  
  // 2. Clear audio buffers
  sendClientEvent({ type: "output_audio_buffer.clear" });
  
  // 3. Wait for audio processing to complete
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 4. Close and cleanup WebRTC connection
  if (pcRef.current) {
    pcRef.current.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    pcRef.current.close();
    pcRef.current = null;
  }
  
  // 5. Reset connection state
  setDataChannel(null);
  setSessionStatus("DISCONNECTED");
}
```

### 3. Enhanced Connection Establishment

Augmented connection logic to inject context:

```typescript
async function connectRealtimeSession({
  agentName,
  initialContext,
}: {
  agentName: string;
  initialContext: Array<{role: string; content: string}>;
}): Promise<void> {
  // 1. Get ephemeral key
  const EPHEMERAL_KEY = await fetchEphemeralKey();
  if (!EPHEMERAL_KEY) {
    return;
  }
  
  // 2. Set up audio element
  if (!audioElementRef.current) {
    audioElementRef.current = document.createElement("audio");
  }
  audioElementRef.current.autoplay = isAudioPlaybackEnabled;
  
  // 3. Establish WebRTC connection
  const { pc, dc } = await createRealtimeConnection(
    EPHEMERAL_KEY,
    audioElementRef,
    urlCodec
  );
  pcRef.current = pc;
  dcRef.current = dc;
  
  // 4. Set up event listeners
  setupDataChannelListeners(dc);
  
  // 5. Update session with agent-specific settings
  const agentConfig = selectedAgentConfigSet?.find(a => a.name === agentName);
  const voice = agentConfig?.voice || "sage";
  const instructions = agentConfig?.instructions || "";
  const tools = agentConfig?.tools || [];
  
  // 6. Configure session with the agent's voice and settings
  sendClientEvent({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions,
      voice,
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: isPTTActive ? null : {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
        create_response: true,
      },
      tools,
    }
  });
  
  // 7. Initialize conversation with context if provided
  if (initialContext && initialContext.length > 0) {
    // Send appropriate events to initialize conversation
    // Implementation details based on Realtime API capabilities
  }
}
```

### 4. Transition State Management

New state to manage transition UI and progress:

```typescript
type TransitionState = "idle" | "preparing" | "disconnecting" | "connecting" | "connected" | "failed";

const [transitionState, setTransitionState] = useState<TransitionState>("idle");
const [transitionProgress, setTransitionProgress] = useState<number>(0);
```

## Integration Points

The Session Reconnection Handler will integrate with:

1. **Conversation State Management**: To preserve and restore conversation context
2. **TranscriptContext**: To maintain conversation history across reconnections
3. **App.tsx**: Core WebRTC connection management
4. **UI Components**: To provide visual feedback during transitions

## Implementation Steps

1. **Create Reconnection Utilities** in `src/app/lib/sessionReconnection.ts`:
   - Implement enhanced disconnection logic
   - Create context-aware connection establishment
   - Develop transition state management

2. **Modify App.tsx**:
   - Integrate new reconnection utilities
   - Add transition state management
   - Modify agent switching logic

3. **Enhance TransferAgents Function**:
   - Update the agent transfer flow in `useHandleServerEvent.ts`
   - Replace the current voice update approach with the reconnection approach

4. **Add Transition UI Components**:
   - Create a transition overlay component
   - Implement progress indicators
   - Add appropriate animation and messaging

## Technical Considerations

- **Error Handling**: Robust handling of connection failures during transitions
- **Timeout Management**: Appropriate timeouts for each stage of the reconnection process
- **Fallback Mechanisms**: Graceful degradation if reconnection fails
- **User Experience**: Minimize perceived delay during transitions
- **Resource Management**: Proper cleanup to prevent memory leaks 
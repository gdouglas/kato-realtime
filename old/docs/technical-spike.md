# Technical Spike: Session Reconnection Validation

## Overview

This technical spike aims to validate the key assumptions of the session reconnection approach before investing in a full implementation. The spike will focus on testing the disconnect/reconnect behavior with the OpenAI Realtime API, evaluating context preservation across sessions, and identifying coupling points in the existing WebRTC implementation.

## Goals

1. Verify that the OpenAI Realtime API supports clean disconnection and reconnection
2. Confirm that conversation context can be maintained across session reconnection
3. Test voice changing via session reconnection
4. Assess the impact of refactoring the current WebRTC implementation

## Timeline

2-3 days of focused development time

## Approach

### 1. Simple Test Application

Create a minimal test application in the project's codebase:

```typescript
// src/app/lib/spikes/reconnectionTest.ts

import { createRealtimeConnection } from '../realtimeConnection';

async function testReconnection() {
  console.log("Starting reconnection test...");
  
  // Step 1: Create initial connection with voice "shimmer"
  const audioElement = document.createElement('audio');
  audioElement.autoplay = true;
  
  const key1 = await fetchEphemeralKey();
  console.log("First connection with key:", key1);
  
  const conn1 = await createRealtimeConnection(key1, audioElement, "opus");
  
  // Set up message handler
  conn1.dc.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);
    console.log("Received message (conn1):", data);
  });
  
  // Set initial voice to "shimmer"
  await sendEvent(conn1.dc, {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: "You are a helpful assistant.",
      voice: "shimmer",
      input_audio_transcription: { model: "whisper-1" }
    }
  });
  
  // Send a message
  await sendEvent(conn1.dc, {
    type: "conversation.item.create",
    item: {
      role: "user",
      content: [
        {
          type: "text",
          text: "Hello, this is the first session."
        }
      ]
    }
  });
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Step 2: Disconnect first connection
  console.log("Cleaning up first connection...");
  
  // Try to cancel any pending audio
  await sendEvent(conn1.dc, { type: "output_audio_buffer.clear" });
  
  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 300));
  
  conn1.pc.getSenders().forEach(sender => {
    if (sender.track) {
      sender.track.stop();
    }
  });
  conn1.pc.close();
  
  console.log("First connection closed");
  
  // Step 3: Create new connection with voice "alloy"
  const key2 = await fetchEphemeralKey();
  console.log("Second connection with key:", key2);
  
  const conn2 = await createRealtimeConnection(key2, audioElement, "opus");
  
  // Set up message handler
  conn2.dc.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);
    console.log("Received message (conn2):", data);
  });
  
  // Set voice to "alloy"
  await sendEvent(conn2.dc, {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: "You are a helpful assistant.\n\nContext from previous session: We were talking in the first session.",
      voice: "alloy",
      input_audio_transcription: { model: "whisper-1" }
    }
  });
  
  // Send a message with context reference
  await sendEvent(conn2.dc, {
    type: "conversation.item.create",
    item: {
      role: "user",
      content: [
        {
          type: "text",
          text: "Do you remember our previous conversation? This is now the second session."
        }
      ]
    }
  });
  
  // Keep connection open for response
  console.log("Test complete. Check console for results.");
}

// Helper functions
async function fetchEphemeralKey(): Promise<string> {
  const response = await fetch("/api/session");
  const data = await response.json();
  return data.client_secret.value;
}

async function sendEvent(dc: RTCDataChannel, eventData: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dc.readyState !== "open") {
      reject(new Error("Data channel not open"));
      return;
    }
    
    try {
      dc.send(JSON.stringify(eventData));
      console.log("Sent event:", eventData);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

export { testReconnection };
```

### 2. WebRTC Coupling Analysis

Create an analysis document outlining coupling points in the current implementation:

```typescript
// src/app/lib/spikes/webrtcCouplingAnalysis.ts

/**
 * WebRTC Coupling Analysis
 * 
 * This analysis identifies key coupling points in the current WebRTC implementation
 * that will need to be addressed in the session reconnection approach.
 */

export function analyzeWebRTCCoupling() {
  return {
    // Direct component state coupling
    stateVariables: [
      {
        name: "dataChannel",
        type: "RTCDataChannel | null",
        notes: "Direct state variable in App.tsx"
      },
      {
        name: "sessionStatus",
        type: "SessionStatus",
        notes: "Used throughout App.tsx for conditional rendering"
      }
    ],
    
    // Refs in the component
    refs: [
      {
        name: "pcRef",
        type: "useRef<RTCPeerConnection | null>",
        notes: "Referenced directly in multiple methods"
      },
      {
        name: "dcRef",
        type: "useRef<RTCDataChannel | null>",
        notes: "Used for sending events throughout codebase"
      },
      {
        name: "audioElementRef",
        type: "useRef<HTMLAudioElement | null>",
        notes: "Passed to createRealtimeConnection"
      }
    ],
    
    // Key methods with WebRTC coupling
    methods: [
      {
        name: "connectToRealtime",
        coupling: "High",
        notes: "Manages connection creation, setup, and event handlers"
      },
      {
        name: "disconnectFromRealtime",
        coupling: "High",
        notes: "Directly manipulates WebRTC resources and state"
      },
      {
        name: "sendClientEvent",
        coupling: "Medium",
        notes: "Relies on dcRef.current"
      },
      {
        name: "updateSession",
        coupling: "Medium",
        notes: "Uses sendClientEvent and manages session state"
      }
    ],
    
    // External dependencies
    dependencies: [
      {
        name: "useHandleServerEvent",
        notes: "Receives message events from data channel"
      },
      {
        name: "createRealtimeConnection",
        notes: "Creates the WebRTC connection but is already abstracted"
      }
    ],
    
    // Recommendation for abstraction approach
    recommendation: `
      1. Create WebRTCManager class to encapsulate connection state/logic
      2. Create useWebRTC hook as public interface
      3. Replace direct state/ref usage with hook interface
      4. Pass event handlers through the hook configuration
    `
  };
}
```

### 3. Context Preservation Test

Create a simple test for context preservation:

```typescript
// src/app/lib/spikes/contextPreservationTest.ts

/**
 * Context Preservation Test
 * 
 * This test validates that conversation context can be preserved
 * between reconnections using the simplified context assembly approach.
 */

import { TranscriptItem } from '@/app/types';

interface SimplifiedContext {
  role: string;
  content: string;
}

export function testContextPreservation() {
  // Sample transcript from an initial session
  const sampleTranscript: TranscriptItem[] = [
    {
      itemId: "user-1",
      type: "MESSAGE",
      role: "user",
      title: "Hello, I'm experiencing vision problems.",
      expanded: false,
      timestamp: "10:15:30 AM",
      createdAtMs: Date.now() - 5000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "assistant-1",
      type: "MESSAGE",
      role: "assistant",
      title: "I'm sorry to hear you're having vision problems. Can you describe what you're experiencing?",
      expanded: false,
      timestamp: "10:15:45 AM",
      createdAtMs: Date.now() - 4000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "user-2",
      type: "MESSAGE",
      role: "user",
      title: "I'm seeing dark spots and blurry vision in my right eye.",
      expanded: false,
      timestamp: "10:16:00 AM",
      createdAtMs: Date.now() - 3000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "assistant-2",
      type: "MESSAGE",
      role: "assistant",
      title: "Dark spots and blurry vision could indicate several conditions. When did you first notice these symptoms?",
      expanded: false,
      timestamp: "10:16:15 AM",
      createdAtMs: Date.now() - 2000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    }
  ];
  
  // Test simple context assembly (chronological approach)
  function assembleSimpleContext(items: TranscriptItem[]): SimplifiedContext[] {
    // Filter relevant messages
    const messageItems = items.filter(item => 
      item.type === "MESSAGE" && !item.isHidden
    );
    
    // Sort chronologically
    const sortedItems = [...messageItems].sort(
      (a, b) => a.createdAtMs - b.createdAtMs
    );
    
    // Convert to simplified format
    return sortedItems.map(item => ({
      role: item.role || "system",
      content: item.title || ""
    }));
  }
  
  // Test agent-aware context assembly
  function assembleAgentContext(
    items: TranscriptItem[],
    targetAgent: string
  ): SimplifiedContext[] {
    // Always include user messages
    const userMessages = items.filter(item => 
      item.type === "MESSAGE" && 
      item.role === "user" && 
      !item.isHidden
    );
    
    // Include messages from target agent
    const agentMessages = items.filter(item => 
      item.type === "MESSAGE" && 
      item.role === "assistant" && 
      item.agentName === targetAgent && 
      !item.isHidden
    );
    
    // Combine and sort chronologically
    const relevantItems = [...userMessages, ...agentMessages].sort(
      (a, b) => a.createdAtMs - b.createdAtMs
    );
    
    // Convert to simplified format
    return relevantItems.map(item => ({
      role: item.role || "system",
      content: item.title || ""
    }));
  }
  
  // Run tests and log results
  console.log("=== Context Preservation Test ===");
  
  const simpleContext = assembleSimpleContext(sampleTranscript);
  console.log("Simple context assembly result:", simpleContext);
  
  const mrKatoContext = assembleAgentContext(sampleTranscript, "mrKato");
  console.log("Agent-aware context (mrKato):", mrKatoContext);
  
  const preceptorContext = assembleAgentContext(sampleTranscript, "preceptor");
  console.log("Agent-aware context (preceptor):", preceptorContext);
  
  return {
    simpleContext,
    mrKatoContext,
    preceptorContext
  };
}
```

## Success Criteria

The technical spike will be considered successful if:

1. **API Compatibility**:
   - We can successfully disconnect and reconnect to the Realtime API
   - We can change voices between sessions
   - No unexpected errors occur during the reconnection process

2. **Context Preservation**:
   - Context can be preserved between sessions
   - The assistant acknowledges previous conversation in a new session
   - Simplified context assembly approach works as expected

3. **Implementation Feasibility**:
   - We have a clear understanding of coupling points in the codebase
   - We have a viable strategy for the WebRTC abstraction layer
   - No blockers are identified for the proposed implementation plan

## Documentation

The results of the technical spike will be documented in a report with:

1. API behavior observations
2. Context preservation test results
3. WebRTC coupling analysis findings
4. Recommendations for implementation approach
5. Any identified risks or limitations

## Next Steps

Based on the spike results, we will either:

1. Proceed with the implementation plan as defined
2. Refine the approach to address any identified issues
3. Explore alternative solutions if major blockers are discovered 
/**
 * WebRTC Reconnection Test
 * 
 * This test validates that a WebRTC connection can be disconnected
 * and reconnected while maintaining proper state.
 */
import { WebRTCManager } from '../../../lib/webrtcManager';
import { initiateVoiceTransition, completeVoiceTransition, applyPreservedContext } from '../../../lib/sessionReconnectionHandler';
import { ConversationState, SimplifiedContext, TransitionStatus } from '../../../types';

export interface ReconnectionTestResult {
  success: boolean;
  connectionTime: number;
  disconnectionTime: number;
  reconnectionTime: number;
  totalOperationTime: number;
  errors?: string[];
  warnings?: string[];
  details?: {
    initialVoice: string;
    targetVoice: string;
    preservedContext?: SimplifiedContext[];
    transitionStatus?: TransitionStatus;
    initialConnection: {
      events: number;
      dataChannelStatus: string;
    };
    secondConnection: {
      events: number;
      dataChannelStatus: string;
    };
  };
}

// Simplified agent configurations for testing
const agentConfigs = {
  PRECEPTOR: {
    name: 'PRECEPTOR',
    publicDescription: 'Medical education preceptor',
    voice: 'shimmer',
    instructions: 'You are a medical education simulation. You are the preceptor guiding a medical student.',
    tools: []
  },
  PATIENT: {
    name: 'PATIENT',
    publicDescription: 'Patient with chest pain',
    voice: 'alloy',
    instructions: 'You are a medical education simulation. You are Mr. Kato, a patient with chest pain.',
    tools: []
  }
};

/**
 * Fetches an ephemeral API key from the server
 */
async function fetchEphemeralKey(): Promise<string> {
  const response = await fetch("/api/session");
  const data = await response.json();
  
  if (!data?.client_secret?.value) {
    throw new Error("Failed to fetch ephemeral key");
  }
  
  return data.client_secret.value;
}

/**
 * Wait for a data channel to open
 * @param dc Data channel to wait for
 * @param timeout Maximum time to wait in ms
 */
function waitForDataChannelOpen(dc: RTCDataChannel, timeout: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (dc.readyState === 'open') {
      resolve(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      dc.removeEventListener('open', onOpen);
      resolve(false);
    }, timeout);

    function onOpen() {
      clearTimeout(timeoutId);
      resolve(true);
    }

    dc.addEventListener('open', onOpen);
  });
}

// Create an initial conversation state for testing
function createInitialConversationState(): ConversationState {
  const timestamp = new Date().toISOString();
  const createdAtMs = Date.now();
  
  return {
    conversationId: `conv-${Date.now()}`,
    createdAt: createdAtMs,
    updatedAt: createdAtMs,
    transcript: [
      {
        itemId: `item-${Date.now()}-1`,
        type: "MESSAGE",
        role: "user",
        expanded: true,
        timestamp: timestamp,
        createdAtMs: createdAtMs - 5000,
        status: "DONE",
        isHidden: false,
        data: { text: "You are a medical education simulation." }
      },
      {
        itemId: `item-${Date.now()}-2`,
        type: "MESSAGE",
        role: "user",
        expanded: true,
        timestamp: timestamp,
        createdAtMs: createdAtMs - 4000,
        status: "DONE",
        isHidden: false,
        data: { text: "What symptoms are you experiencing?" }
      },
      {
        itemId: `item-${Date.now()}-3`,
        type: "MESSAGE",
        role: "assistant",
        expanded: true,
        timestamp: timestamp,
        createdAtMs: createdAtMs - 3000,
        status: "DONE", 
        isHidden: false,
        data: { text: "I have been experiencing chest pain for about two days." },
        agentName: "PATIENT"
      }
    ],
    agents: {
      PRECEPTOR: {
        agentName: "PRECEPTOR",
        voice: "shimmer",
        instructions: "You are a medical education simulation. You are the preceptor guiding a medical student."
      },
      PATIENT: {
        agentName: "PATIENT",
        voice: "alloy",
        instructions: "You are a medical education simulation. You are Mr. Kato, a patient with chest pain."
      }
    },
    currentAgent: "PRECEPTOR",
    transition: {
      status: "IDLE" as TransitionStatus,
    },
    version: "1.0"
  };
}

/**
 * Tests WebRTC reconnection capability by creating two sequential connections
 * with different voice settings, using the actual session reconnection handler
 * @returns Test results with timing and success information
 */
export async function testReconnection(): Promise<ReconnectionTestResult> {
  const startTime = performance.now();
  let timeMarker = startTime;
  const errors: string[] = [];
  const warnings: string[] = [];
  const events1: any[] = [];
  const events2: any[] = [];
  
  // Function to log and measure time
  const logTimestamp = (label: string): number => {
    const now = performance.now();
    const elapsed = now - timeMarker;
    timeMarker = now;
    console.log(`[${label}] Completed in ${elapsed}ms`);
    return elapsed;
  };
  
  // Create a conversation state for the test
  let conversationState = createInitialConversationState();
  
  try {
    console.log("Starting WebRTC Reconnection Test...");
    
    // Create audio element for playback
    const audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    
    // PHASE 1: INITIAL CONNECTION WITH FIRST VOICE
    console.log("Phase 1: Establishing first connection with 'shimmer' voice (PRECEPTOR)");
    
    // Get the ephemeral key
    const key1 = await fetchEphemeralKey();
    console.log(`First connection key obtained`);
    
    // Create the first WebRTC manager
    const manager1 = new WebRTCManager();
    
    // Start timing connection
    const connectionStartTime = performance.now();
    
    // Connect to the API
    const connectSuccess = await manager1.connect(
      key1,
      audioElement,
      "opus",
      (data) => {
        console.log("First connection received event:", data);
        events1.push(data);
      },
      (status) => console.log("First connection status:", status),
      (error) => {
        console.error("First connection error:", error);
        errors.push(`First connection error: ${error.message}`);
      }
    );
    
    if (!connectSuccess) {
      throw new Error("Failed to establish first connection");
    }
    
    const connectionTime = performance.now() - connectionStartTime;
    logTimestamp("First connection established");
    
    // Initialize the session with the first voice (shimmer/preceptor)
    const sessionInitialized = manager1.updateSession(
      agentConfigs.PRECEPTOR.instructions,
      agentConfigs.PRECEPTOR.voice
    );
    
    if (!sessionInitialized) {
      warnings.push("Failed to initialize first session with voice");
    }
    
    // Send a test message
    const messageSent = manager1.sendEvent({
      type: "conversation.item.create",
      item: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello, this is a reconnection test. Please respond briefly."
          }
        ]
      }
    });
    
    if (!messageSent) {
      warnings.push("Failed to send test message in first connection");
    }
    
    // Wait for a response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // PHASE 2: INITIATE VOICE TRANSITION USING SESSION RECONNECTION HANDLER
    console.log("Phase 2: Initiating voice transition using sessionReconnectionHandler");
    
    try {
      // Use the actual voice transition code
      conversationState = await initiateVoiceTransition(
        conversationState,
        'PRECEPTOR',
        'PATIENT',
        agentConfigs
      );
      
      console.log("Voice transition initiated", conversationState.transition);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Transition initiation error: ${errorMessage}`);
    }
    
    // PHASE 3: DISCONNECTION
    console.log("Phase 3: Disconnecting first connection");
    
    const disconnectionStartTime = performance.now();
    
    // Disconnect from the first session
    manager1.disconnect();
    
    const disconnectionTime = performance.now() - disconnectionStartTime;
    logTimestamp("First connection disconnected");
    
    // Wait a brief moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // PHASE 4: RECONNECTION WITH NEW VOICE
    console.log("Phase 4: Establishing second connection with 'alloy' voice (PATIENT)");
    
    // Get a fresh key for the second connection
    const key2 = await fetchEphemeralKey();
    console.log(`Second connection key obtained`);
    
    // Create the second WebRTC manager
    const manager2 = new WebRTCManager();
    
    // Start timing reconnection
    const reconnectionStartTime = performance.now();
    
    // Connect to the API with the second manager
    const reconnectSuccess = await manager2.connect(
      key2,
      audioElement,
      "opus",
      (data) => {
        console.log("Second connection received event:", data);
        events2.push(data);
      },
      (status) => console.log("Second connection status:", status),
      (error) => {
        console.error("Second connection error:", error);
        errors.push(`Second connection error: ${error.message}`);
      }
    );
    
    if (!reconnectSuccess) {
      throw new Error("Failed to establish second connection");
    }
    
    // Get the data channel
    const dataChannel = manager2.getDataChannel();
    if (!dataChannel) {
      throw new Error("No data channel available in second connection");
    }
    
    // PHASE 5: APPLY PRESERVED CONTEXT USING CONTEXT ASSEMBLY ENGINE
    console.log("Phase 5: Applying preserved context to new connection");
    
    if (dataChannel.readyState === 'open') {
      try {
        // Use the actual context application code
        const contextApplied = await applyPreservedContext(
          dataChannel,
          conversationState,
          agentConfigs.PATIENT.instructions
        );
        
        if (!contextApplied) {
          warnings.push("Failed to apply preserved context");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        warnings.push(`Context application error: ${errorMessage}`);
      }
    } else {
      warnings.push(`Cannot apply context - data channel not open: ${dataChannel.readyState}`);
    }
    
    // PHASE 6: COMPLETE THE TRANSITION
    console.log("Phase 6: Completing the voice transition");
    
    try {
      // Use the actual transition completion code
      conversationState = await completeVoiceTransition(
        conversationState,
        dataChannel,
        true
      );
      
      console.log("Voice transition completed", conversationState.transition);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Transition completion error: ${errorMessage}`);
    }
    
    const reconnectionTime = performance.now() - reconnectionStartTime;
    logTimestamp("Second connection established and context applied");
    
    // Send a test message on the second connection
    const secondMessageSent = manager2.sendEvent({
      type: "conversation.item.create",
      item: {
        role: "user",
        content: [
          {
            type: "text",
            text: "This is the second connection. Please respond briefly as Mr. Kato."
          }
        ]
      }
    });
    
    if (!secondMessageSent) {
      warnings.push("Failed to send test message in second connection");
    }
    
    // Wait for a response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clean up second connection
    manager2.disconnect();
    
    // Calculate total time
    const totalOperationTime = performance.now() - startTime;
    
    // Check for success criteria
    const success = reconnectSuccess && 
                   events1.length > 0 && 
                   events2.length > 0 && 
                   errors.length === 0 &&
                   conversationState.transition.status === 'IDLE';
    
    // Return comprehensive results
    return {
      success,
      connectionTime,
      disconnectionTime,
      reconnectionTime,
      totalOperationTime,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      details: {
        initialVoice: agentConfigs.PRECEPTOR.voice,
        targetVoice: agentConfigs.PATIENT.voice,
        preservedContext: conversationState.transition.preservedContext,
        transitionStatus: conversationState.transition.status,
        initialConnection: {
          events: events1.length,
          dataChannelStatus: manager1.getDataChannel()?.readyState || "unknown"
        },
        secondConnection: {
          events: events2.length,
          dataChannelStatus: manager2.getDataChannel()?.readyState || "unknown"
        }
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Reconnection test failed:", errorMessage);
    
    // Return failure result with error information
    return {
      success: false,
      connectionTime: 0,
      disconnectionTime: 0,
      reconnectionTime: 0,
      totalOperationTime: performance.now() - startTime,
      errors: [errorMessage],
      warnings
    };
  }
} 
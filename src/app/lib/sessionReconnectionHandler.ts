import { ConversationState, SimplifiedContext, AgentConfig, TransitionStatus } from "../types";
import { saveConversationState, updateTransitionState } from "./conversationStateManager";
import { assembleContext } from "./contextAssembly";

/**
 * Initiate a voice transition between agents
 */
export async function initiateVoiceTransition(
  state: ConversationState,
  fromAgent: string,
  toAgent: string,
  agentConfigs: Record<string, AgentConfig>
): Promise<ConversationState> {
  try {
    console.log(`Initiating voice transition from ${fromAgent} to ${toAgent}`);
    
    // Update transition state to indicate we're transitioning
    const updatedState = updateTransitionState(state, {
      status: "TRANSITIONING" as TransitionStatus,
      fromAgent,
      toAgent,
      startTimeMs: Date.now(),
      error: undefined
    });
    
    // Get agent configs
    const fromAgentConfig = agentConfigs[fromAgent];
    const toAgentConfig = agentConfigs[toAgent];
    
    if (!toAgentConfig) {
      throw new Error(`Agent configuration not found for: ${toAgent}`);
    }
    
    // Assemble context to preserve
    const preservedContext = assembleContext(
      state.transcript,
      toAgent,
      toAgentConfig,
      "role-based" // Use role-based strategy for best context quality
    );
    
    // Store context in transition state
    const stateWithContext = updateTransitionState(updatedState, {
      preservedContext
    });
    
    // Persist the state with transition info
    saveConversationState(stateWithContext);
    
    return stateWithContext;
  } catch (error) {
    console.error("Error initiating voice transition:", error);
    
    // Update transition state to indicate failure
    const failedState = updateTransitionState(state, {
      status: "FAILED" as TransitionStatus,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Persist the failed state
    saveConversationState(failedState);
    
    throw error;
  }
}

/**
 * Complete a voice transition after reconnection
 */
export async function completeVoiceTransition(
  state: ConversationState,
  dataChannel: RTCDataChannel,
  success: boolean = true
): Promise<ConversationState> {
  try {
    if (success) {
      console.log("Completing voice transition successfully");
      
      // Get transition info
      const { toAgent, preservedContext } = state.transition;
      
      if (!toAgent) {
        throw new Error("Missing target agent in transition state");
      }
      
      // Update the state to finalize transition
      const updatedState = {
        ...state,
        currentAgent: toAgent,
        transition: {
          status: "IDLE" as TransitionStatus,
          fromAgent: undefined,
          toAgent: undefined,
          startTimeMs: undefined,
          error: undefined,
          preservedContext: undefined
        }
      };
      
      // Persist the updated state
      saveConversationState(updatedState);
      
      return updatedState;
    } else {
      // Handle transition failure
      console.error("Voice transition failed during reconnection");
      
      // Reset to idle but keep error info
      const failedState = updateTransitionState(state, {
        status: "FAILED" as TransitionStatus,
        error: "Failed during reconnection phase"
      });
      
      // Persist the failed state
      saveConversationState(failedState);
      
      return failedState;
    }
  } catch (error) {
    console.error("Error completing voice transition:", error);
    
    // Update transition state to indicate failure
    const failedState = updateTransitionState(state, {
      status: "FAILED" as TransitionStatus,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Persist the failed state
    saveConversationState(failedState);
    
    throw error;
  }
}

/**
 * Apply preserved context to a new session
 */
export async function applyPreservedContext(
  dataChannel: RTCDataChannel,
  state: ConversationState,
  systemInstructions?: string
): Promise<boolean> {
  try {
    if (!dataChannel || dataChannel.readyState !== "open") {
      throw new Error("Data channel not open");
    }
    
    // Get transition data
    const { toAgent, preservedContext } = state.transition;
    
    if (!toAgent || !preservedContext) {
      throw new Error("Missing transition data");
    }
    
    // Get agent config
    const agentConfig = state.agents[toAgent];
    
    if (!agentConfig) {
      throw new Error(`Agent not found in state: ${toAgent}`);
    }
    
    // Prepare session update with context
    const instructions = systemInstructions || createSessionInstructions(preservedContext);
    
    // Apply voice settings
    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice: agentConfig.voice || "alloy", // Default to alloy if not specified
        input_audio_transcription: { model: "whisper-1" }
      }
    };
    
    // Send the session update
    dataChannel.send(JSON.stringify(sessionUpdate));
    console.log("Applied context to new session:", { toAgent, voice: agentConfig.voice });
    
    return true;
  } catch (error) {
    console.error("Error applying preserved context:", error);
    return false;
  }
}

/**
 * Create session instructions from preserved context
 */
function createSessionInstructions(context: SimplifiedContext[]): string {
  // Extract system messages
  const systemMessages = context
    .filter(item => item.isSystemMessage || item.role === "system")
    .map(item => item.content);
  
  // Format regular conversation context
  const conversationContext = context
    .filter(item => !item.isSystemMessage && item.role !== "system")
    .map(item => `${item.role}: ${item.content}`);
  
  // Combine into final instructions
  let instructions = "";
  
  if (systemMessages.length > 0) {
    instructions += systemMessages.join("\n\n");
  }
  
  if (conversationContext.length > 0) {
    instructions += "\n\nContext from previous conversation:\n";
    instructions += conversationContext.join("\n");
  }
  
  return instructions;
}

/**
 * Check if a transition is currently in progress
 */
export function isTransitionInProgress(state: ConversationState): boolean {
  return state.transition.status === "TRANSITIONING";
}

/**
 * Get the current transition status
 */
export function getTransitionStatus(state: ConversationState): TransitionStatus {
  return state.transition.status;
}

/**
 * Calculate transition duration in milliseconds
 */
export function getTransitionDuration(state: ConversationState): number {
  if (state.transition.startTimeMs) {
    return Date.now() - state.transition.startTimeMs;
  }
  return 0;
}

/**
 * Reset a failed transition
 */
export function resetFailedTransition(state: ConversationState): ConversationState {
  return updateTransitionState(state, {
    status: "IDLE" as TransitionStatus,
    fromAgent: undefined,
    toAgent: undefined,
    startTimeMs: undefined,
    error: undefined,
    preservedContext: undefined
  });
} 
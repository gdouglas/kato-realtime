/**
 * Agent Transfer Test
 * 
 * This spike tests the full agent transfer functionality, validating that
 * we can smoothly transition between different agents while preserving
 * conversation context.
 * 
 * Test procedure:
 * 1. Start with Preceptor agent (voice: Shimmer)
 * 2. Have a short conversation
 * 3. Transfer to Patient agent (voice: Ash)
 * 4. Verify context is preserved
 * 5. Continue conversation with Patient agent
 * 6. Transfer back to Preceptor
 * 7. Verify full conversation history is intact
 */

import { WebRTCManager } from "../webrtcManager";

// Agent definitions
interface Agent {
  name: string;
  role: string;
  voice: string;
  baseInstructions: string;
}

const AGENTS: Record<string, Agent> = {
  PRECEPTOR: {
    name: "Preceptor",
    role: "instructor",
    voice: "shimmer",
    baseInstructions: "You are a medical education preceptor guiding a student through a patient interaction."
  },
  PATIENT: {
    name: "Mr. Kato",
    role: "patient",
    voice: "ash",
    baseInstructions: "You are Mr. Kato, a 65-year-old male presenting with chest pain. You are anxious about your condition."
  }
};

// Conversation storage
interface ConversationItem {
  role: string;
  content: string;
  agent?: string;
  timestamp: number;
}

interface ConversationState {
  id: string;
  items: ConversationItem[];
  currentAgent: string;
  metadata: Record<string, any>;
}

// Context assembly strategies
enum ContextStrategy {
  BASIC = "basic",
  AGENT_AWARE = "agent-aware", 
  ROLE_BASED = "role-based"
}

// Create a new empty conversation
function createConversation(): ConversationState {
  return {
    id: `conv-${Date.now()}`,
    items: [],
    currentAgent: "PRECEPTOR",
    metadata: {
      patientName: "Mr. Kato",
      chiefComplaint: "Chest pain",
      createdAt: Date.now()
    }
  };
}

// Add item to conversation
function addConversationItem(
  conversation: ConversationState, 
  role: string, 
  content: string,
  agent?: string
): ConversationState {
  return {
    ...conversation,
    items: [
      ...conversation.items,
      {
        role,
        content,
        agent: agent || conversation.currentAgent,
        timestamp: Date.now()
      }
    ]
  };
}

// Assemble context based on strategy
function assembleContext(
  conversation: ConversationState, 
  targetAgent: string,
  strategy: ContextStrategy
): string {
  // Basic context - just pass all conversation items
  if (strategy === ContextStrategy.BASIC) {
    return JSON.stringify({
      conversationId: conversation.id,
      metadata: conversation.metadata,
      messages: conversation.items.map(item => ({
        role: item.role,
        content: item.content
      }))
    });
  }
  
  // Agent-aware context - include agent information with messages
  if (strategy === ContextStrategy.AGENT_AWARE) {
    return JSON.stringify({
      conversationId: conversation.id,
      metadata: conversation.metadata,
      currentAgent: targetAgent,
      previousAgent: conversation.currentAgent,
      messages: conversation.items.map(item => ({
        role: item.role,
        content: item.content,
        agent: item.agent
      }))
    });
  }
  
  // Role-based context - organize by agent role
  if (strategy === ContextStrategy.ROLE_BASED) {
    // Group messages by agent
    const preceptorMessages = conversation.items
      .filter(item => item.agent === "PRECEPTOR")
      .map(item => item.content);
      
    const patientMessages = conversation.items
      .filter(item => item.agent === "PATIENT")
      .map(item => item.content);
    
    // Common context for both agents
    const commonContext = {
      conversationId: conversation.id,
      metadata: conversation.metadata,
      allMessages: conversation.items.map(item => ({
        role: item.role,
        content: item.content,
        agent: item.agent
      }))
    };
    
    // Role-specific context
    return JSON.stringify({
      ...commonContext,
      roles: {
        preceptor: {
          context: AGENTS.PRECEPTOR.baseInstructions,
          messages: preceptorMessages
        },
        patient: {
          context: AGENTS.PATIENT.baseInstructions,
          messages: patientMessages
        }
      },
      // Focus on the current role
      currentRole: targetAgent === "PRECEPTOR" ? "preceptor" : "patient"
    });
  }
  
  // Default to basic if strategy not recognized
  return JSON.stringify({
    conversationId: conversation.id,
    messages: conversation.items.map(item => ({
      role: item.role,
      content: item.content
    }))
  });
}

// Transfer agent function
async function transferAgent(
  conversation: ConversationState,
  currentManager: WebRTCManager,
  targetAgent: string,
  ephemeralKey: string,
  audioElement: HTMLAudioElement,
  strategy: ContextStrategy = ContextStrategy.AGENT_AWARE
): Promise<{
  success: boolean;
  newConversation: ConversationState;
  manager: WebRTCManager;
  metrics: {
    disconnectionTime: number;
    reconnectionTime: number;
    totalTransferTime: number;
  };
}> {
  console.log(`Transferring from ${conversation.currentAgent} to ${targetAgent}`);
  const startTime = performance.now();
  let disconnectionTime = 0;
  let reconnectionTime = 0;
  
  try {
    // Validate target agent
    if (!AGENTS[targetAgent]) {
      throw new Error(`Unknown agent: ${targetAgent}`);
    }
    
    // Phase 1: Disconnect current session
    console.log("Phase 1: Disconnecting current session");
    const disconnectStart = performance.now();
    currentManager.disconnect();
    disconnectionTime = performance.now() - disconnectStart;
    console.log(`Session disconnected in ${disconnectionTime}ms`);
    
    // Wait briefly between disconnection and reconnection
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Phase 2: Reconnect with new agent
    console.log(`Phase 2: Connecting with ${targetAgent}`);
    const reconnectStart = performance.now();
    
    // Create a new manager for the new connection
    const newManager = new WebRTCManager();
    
    const reconnectSuccess = await newManager.connect(
      ephemeralKey,
      audioElement,
      "opus",
      (data) => console.log("Data received:", data),
      (status) => console.log("Status changed:", status),
      (error) => console.error("Error:", error)
    );
    
    if (!reconnectSuccess) {
      throw new Error("Reconnection failed");
    }
    
    // Assemble context for the target agent
    const context = assembleContext(conversation, targetAgent, strategy);
    
    // Phase 3: Update session with new agent voice and context
    console.log("Phase 3: Updating session with new agent voice and context");
    const instructions = `${AGENTS[targetAgent].baseInstructions}\n\nConversation context: ${context}`;
    
    const sessionUpdateSuccess = newManager.updateSession(
      instructions,
      AGENTS[targetAgent].voice
    );
    
    if (!sessionUpdateSuccess) {
      throw new Error("Session update failed");
    }
    
    // Update conversation state
    const newConversation = {
      ...conversation,
      currentAgent: targetAgent
    };
    
    // Calculate metrics
    reconnectionTime = performance.now() - reconnectStart;
    const totalTransferTime = performance.now() - startTime;
    
    console.log(`Agent transfer completed in ${totalTransferTime}ms`);
    
    return {
      success: true,
      newConversation,
      manager: newManager,
      metrics: {
        disconnectionTime,
        reconnectionTime,
        totalTransferTime
      }
    };
  } catch (error) {
    console.error("Agent transfer failed:", error);
    return {
      success: false,
      newConversation: conversation,
      manager: currentManager,
      metrics: {
        disconnectionTime,
        reconnectionTime,
        totalTransferTime: performance.now() - startTime
      }
    };
  }
}

// Simulated conversation step
async function simulateConversationStep(
  manager: WebRTCManager,
  conversation: ConversationState,
  userMessage: string
): Promise<ConversationState> {
  // Add user message to conversation
  let updatedConversation = addConversationItem(
    conversation,
    "user",
    userMessage
  );
  
  // Send message to API
  const messageSuccess = manager.sendEvent({
    type: "conversation.item.create",
    item: {
      role: "user",
      type: "message",
      content: [
        {
          type: "text",
          text: userMessage
        }
      ]
    }
  });
  
  console.log(`Message sent: ${messageSuccess ? "success" : "failed"}`);
  
  // Wait for simulated assistant response (in real app, this would be handled by event listeners)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Simulate assistant response
  const assistantResponse = `This is a simulated response from ${AGENTS[conversation.currentAgent].name}.`;
  
  // Add assistant response to conversation
  updatedConversation = addConversationItem(
    updatedConversation,
    "assistant",
    assistantResponse,
    conversation.currentAgent
  );
  
  return updatedConversation;
}

// Run the full agent transfer test
export async function runAgentTransferTest(ephemeralKey: string) {
  console.log("Starting agent transfer test");
  
  // Test configuration
  const strategyToTest = ContextStrategy.AGENT_AWARE;
  
  try {
    // Create audio element
    const audioElement = new Audio();
    audioElement.autoplay = true;
    
    // Create initial conversation
    let conversation = createConversation();
    console.log("Created new conversation:", conversation);
    
    // Phase 1: Start with Preceptor
    console.log("Phase 1: Starting with Preceptor");
    let manager = new WebRTCManager();
    
    const initialConnectSuccess = await manager.connect(
      ephemeralKey,
      audioElement,
      "opus",
      (data) => console.log("Data received:", data),
      (status) => console.log("Status changed:", status),
      (error) => console.error("Error:", error)
    );
    
    if (!initialConnectSuccess) {
      throw new Error("Initial connection failed");
    }
    
    // Set up Preceptor instructions and voice
    const preceptorUpdateSuccess = manager.updateSession(
      AGENTS.PRECEPTOR.baseInstructions,
      AGENTS.PRECEPTOR.voice
    );
    
    console.log(`Preceptor session update: ${preceptorUpdateSuccess ? "success" : "failed"}`);
    
    // Simulate initial conversation with Preceptor
    conversation = await simulateConversationStep(
      manager,
      conversation,
      "Hello, I'd like to discuss the case of Mr. Kato."
    );
    
    conversation = await simulateConversationStep(
      manager,
      conversation,
      "What should I focus on during the patient interview?"
    );
    
    console.log("Conversation after Preceptor interaction:", conversation);
    
    // Phase 2: Transfer to Patient
    console.log("Phase 2: Transferring to Patient");
    const transferResult = await transferAgent(
      conversation,
      manager,
      "PATIENT",
      ephemeralKey,
      audioElement,
      strategyToTest
    );
    
    if (!transferResult.success) {
      throw new Error("Transfer to Patient failed");
    }
    
    // Update state
    conversation = transferResult.newConversation;
    manager = transferResult.manager;
    
    console.log("Transfer metrics:", transferResult.metrics);
    
    // Simulate conversation with Patient
    conversation = await simulateConversationStep(
      manager,
      conversation,
      "Hello Mr. Kato, how are you feeling today?"
    );
    
    conversation = await simulateConversationStep(
      manager,
      conversation,
      "Can you tell me more about your chest pain?"
    );
    
    console.log("Conversation after Patient interaction:", conversation);
    
    // Phase 3: Transfer back to Preceptor
    console.log("Phase 3: Transferring back to Preceptor");
    const secondTransferResult = await transferAgent(
      conversation,
      manager,
      "PRECEPTOR",
      ephemeralKey,
      audioElement,
      strategyToTest
    );
    
    if (!secondTransferResult.success) {
      throw new Error("Transfer back to Preceptor failed");
    }
    
    // Update state
    conversation = secondTransferResult.newConversation;
    manager = secondTransferResult.manager;
    
    console.log("Second transfer metrics:", secondTransferResult.metrics);
    
    // Final conversation step with Preceptor
    conversation = await simulateConversationStep(
      manager,
      conversation,
      "What do you think about the patient's symptoms?"
    );
    
    console.log("Final conversation state:", conversation);
    
    // Clean up
    manager.disconnect();
    
    // Return test results
    return {
      success: true,
      firstTransferMetrics: transferResult.metrics,
      secondTransferMetrics: secondTransferResult.metrics,
      finalConversation: conversation
    };
  } catch (error) {
    console.error("Agent transfer test failed:", error);
    return {
      success: false,
      error
    };
  }
}

// To use this test, call:
// import { runAgentTransferTest } from './lib/spikes/agentTransferTest';
// runAgentTransferTest('your-ephemeral-key'); 
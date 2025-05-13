import { ConversationState, TranscriptItem, AgentState, TransitionState } from "../types";

// Constants
const STORAGE_KEY_PREFIX = "kato_conversation_";
const CURRENT_VERSION = "1.0.0";

/**
 * Save conversation state to localStorage
 */
export function saveConversationState(state: ConversationState): boolean {
  try {
    // Update the timestamp
    state.updatedAt = Date.now();
    
    // Ensure version is set
    state.version = state.version || CURRENT_VERSION;
    
    // Serialize and save
    const serializedState = JSON.stringify(state);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${state.conversationId}`, serializedState);
    
    // Also update the list of conversations
    updateConversationIndex(state.conversationId);
    
    return true;
  } catch (error) {
    console.error("Error saving conversation state:", error);
    return false;
  }
}

/**
 * Load conversation state from localStorage
 */
export function loadConversationState(conversationId: string): ConversationState | null {
  try {
    const serializedState = localStorage.getItem(`${STORAGE_KEY_PREFIX}${conversationId}`);
    
    if (!serializedState) {
      return null;
    }
    
    const state = JSON.parse(serializedState) as ConversationState;
    
    // Check and update version if needed
    if (!state.version) {
      state.version = CURRENT_VERSION;
    }
    
    return state;
  } catch (error) {
    console.error("Error loading conversation state:", error);
    return null;
  }
}

/**
 * Initialize a new conversation state
 */
export function initializeConversationState(initialAgent?: string): ConversationState {
  const now = Date.now();
  const conversationId = generateConversationId();
  
  const initialState: ConversationState = {
    conversationId,
    createdAt: now,
    updatedAt: now,
    transcript: [],
    agents: {},
    currentAgent: initialAgent,
    transition: {
      status: "IDLE"
    },
    version: CURRENT_VERSION
  };
  
  // Save the initial state
  saveConversationState(initialState);
  
  return initialState;
}

/**
 * Add or update an agent in the conversation state
 */
export function updateAgentState(
  state: ConversationState,
  agentName: string,
  agentUpdate: Partial<AgentState>
): ConversationState {
  // Create a copy of the state to avoid direct mutation
  const updatedState = { ...state };
  
  // Initialize agent if it doesn't exist
  if (!updatedState.agents[agentName]) {
    updatedState.agents[agentName] = {
      agentName,
      lastInteractionMs: Date.now(),
      contextItems: []
    };
  }
  
  // Update with new values
  updatedState.agents[agentName] = {
    ...updatedState.agents[agentName],
    ...agentUpdate,
    // Always refresh the lastInteractionMs
    lastInteractionMs: Date.now()
  };
  
  return updatedState;
}

/**
 * Add a transcript item to the conversation state
 */
export function addTranscriptItem(
  state: ConversationState,
  item: TranscriptItem
): ConversationState {
  // Create a copy of the state
  const updatedState = { 
    ...state,
    transcript: [...state.transcript, item],
    updatedAt: Date.now()
  };
  
  // If the item has an agentName, update that agent's context items
  if (item.agentName && updatedState.agents[item.agentName]) {
    const agent = updatedState.agents[item.agentName];
    
    // Add to agent's contextItems if it doesn't exist yet
    if (agent.contextItems) {
      agent.contextItems = [...agent.contextItems, item];
    } else {
      agent.contextItems = [item];
    }
    
    // Update the agent's last interaction time
    agent.lastInteractionMs = Date.now();
  }
  
  return updatedState;
}

/**
 * Update the transition state
 */
export function updateTransitionState(
  state: ConversationState,
  transitionUpdate: Partial<TransitionState>
): ConversationState {
  return {
    ...state,
    transition: {
      ...state.transition,
      ...transitionUpdate
    },
    updatedAt: Date.now()
  };
}

/**
 * List all saved conversations
 */
export function listSavedConversations(): { id: string; updatedAt: number }[] {
  try {
    const conversationIndex = localStorage.getItem(`${STORAGE_KEY_PREFIX}index`);
    
    if (!conversationIndex) {
      return [];
    }
    
    return JSON.parse(conversationIndex);
  } catch (error) {
    console.error("Error listing saved conversations:", error);
    return [];
  }
}

/**
 * Delete a saved conversation
 */
export function deleteConversation(conversationId: string): boolean {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${conversationId}`);
    
    // Also update the index
    const conversationIndex = listSavedConversations()
      .filter(item => item.id !== conversationId);
    
    localStorage.setItem(`${STORAGE_KEY_PREFIX}index`, JSON.stringify(conversationIndex));
    
    return true;
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return false;
  }
}

/**
 * Clear all conversation data
 */
export function clearAllConversations(): boolean {
  try {
    // Get list of all conversations
    const conversations = listSavedConversations();
    
    // Remove each conversation
    conversations.forEach(conversation => {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${conversation.id}`);
    });
    
    // Clear the index
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}index`);
    
    return true;
  } catch (error) {
    console.error("Error clearing all conversations:", error);
    return false;
  }
}

// Helper functions

/**
 * Generate a unique conversation ID
 */
function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Update the conversation index
 */
function updateConversationIndex(conversationId: string): void {
  try {
    // Get existing index or initialize
    const existingIndex = listSavedConversations();
    
    // Remove this conversation if it already exists
    const filteredIndex = existingIndex.filter(item => item.id !== conversationId);
    
    // Add it as the most recent
    const updatedIndex = [
      ...filteredIndex,
      { id: conversationId, updatedAt: Date.now() }
    ];
    
    // Save the updated index
    localStorage.setItem(`${STORAGE_KEY_PREFIX}index`, JSON.stringify(updatedIndex));
  } catch (error) {
    console.error("Error updating conversation index:", error);
  }
}

/**
 * Check if localStorage is available and working
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = `${STORAGE_KEY_PREFIX}test`;
    localStorage.setItem(testKey, "test");
    const result = localStorage.getItem(testKey) === "test";
    localStorage.removeItem(testKey);
    return result;
  } catch (error) {
    return false;
  }
} 
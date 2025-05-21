/**
 * Token counting utilities for conversation contexts
 * 
 * Note: This is an approximation since exact GPT tokenization requires the tiktoken library,
 * which is not easily available in browser environments. The approximation used here
 * is based on common patterns in English text tokenization.
 */

import { TranscriptItem } from "@/app/types";

/**
 * Approximates token count of a string for GPT models
 * This is a rough approximation - about 4 characters per token for English text
 * 
 * @param text String to count tokens for
 * @returns Approximate token count
 */
export function approximateTokenCount(text?: string): number {
  if (!text) return 0;
  
  // Split on whitespace and punctuation
  const words = text.split(/[\s,.!?;:()\[\]{}'"]+/);
  // Filter out empty strings
  const filteredWords = words.filter(word => word.length > 0);
  
  // Count words and add extra tokens for long words
  let tokens = 0;
  for (const word of filteredWords) {
    // Very approximate - shorter words are usually 1 token
    // Longer words may be split into multiple tokens
    tokens += Math.ceil(word.length / 4);
  }
  
  // Add a small overhead for spaces and punctuation
  tokens += Math.ceil(text.length / 100);
  
  return tokens;
}

/**
 * Calculates token counts for a message based on its role and content
 */
export function calculateMessageTokens(message: TranscriptItem): number {
  if (message.type !== 'MESSAGE') return 0;
  
  // Base tokens for message structure - role, etc.
  let tokens = 4; 
  
  // Add tokens for content
  if (message.title) {
    tokens += approximateTokenCount(message.title);
  }
  
  return tokens;
}

/**
 * Calculates total tokens for a conversation
 */
export function calculateConversationTokens(messages: TranscriptItem[]): number {
  // Base tokens for conversation structure
  let total = 3; 
  
  // Add tokens for each message
  for (const message of messages) {
    total += calculateMessageTokens(message);
  }
  
  return total;
}

/**
 * Analyzes all agent conversations and returns token counts
 */
export function getAgentConversationTokenCounts(): Record<string, { messages: number, tokens: number }> {
  if (typeof window === 'undefined' || !window.__AGENT_CONVERSATION_CONTEXTS__) {
    return {};
  }
  
  const result: Record<string, { messages: number, tokens: number }> = {};
  const contexts = window.__AGENT_CONVERSATION_CONTEXTS__;
  
  Object.entries(contexts).forEach(([agentName, messages]) => {
    const tokens = calculateConversationTokens(messages);
    result[agentName] = {
      messages: messages.length,
      tokens
    };
  });
  
  return result;
} 
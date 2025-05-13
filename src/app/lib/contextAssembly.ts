import { TranscriptItem, SimplifiedContext, AgentConfig } from "../types";

// Constants
const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_MAX_TOKENS = 1000;

/**
 * Strategy 1: Basic context assembly
 * Simply preserves recent messages chronologically
 */
export function assembleBasicContext(
  transcriptItems: TranscriptItem[],
  maxItems: number = DEFAULT_MAX_ITEMS
): SimplifiedContext[] {
  // Filter to include only MESSAGE type items that aren't hidden
  const messageItems = transcriptItems.filter(item => 
    item.type === "MESSAGE" && !item.isHidden
  );
  
  // Sort by creation time (oldest first)
  const sortedItems = [...messageItems].sort(
    (a, b) => a.createdAtMs - b.createdAtMs
  );
  
  // Take the most recent N items
  const recentItems = sortedItems.slice(
    Math.max(0, sortedItems.length - maxItems)
  );
  
  // Convert to simplified format
  return recentItems.map(item => ({
    role: item.role || "system",
    content: item.title || "",
    agentName: item.agentName
  }));
}

/**
 * Strategy 2: Agent-aware context assembly
 * Filters by target agent and relevant user messages
 */
export function assembleAgentAwareContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  maxItems: number = DEFAULT_MAX_ITEMS
): SimplifiedContext[] {
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
  const recentItems = relevantItems.slice(
    Math.max(0, relevantItems.length - maxItems)
  );
  
  // Convert to simplified format
  return recentItems.map(item => ({
    role: item.role || "system",
    content: item.title || "",
    agentName: item.agentName
  }));
}

/**
 * Strategy 3: Role-based context assembly
 * Uses agent-specific rules to tailor context
 */
export function assembleRoleBasedContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  agentConfig: AgentConfig,
  maxTokens: number = DEFAULT_MAX_TOKENS
): SimplifiedContext[] {
  // Create a tailored context based on the agent's role
  let context: SimplifiedContext[] = [];
  
  // Create an intro that explains the role for continuity
  const systemIntro: SimplifiedContext = {
    role: "system",
    content: agentConfig.instructions || `You are ${targetAgent}.`,
    isSystemMessage: true,
    agentName: targetAgent
  };
  
  // Start with chronologically sorted items
  const messageItems = transcriptItems
    .filter(item => item.type === "MESSAGE" && !item.isHidden)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  
  // Extract key information based on agent role
  const keyInfo = extractKeyInformation(messageItems, targetAgent);
  
  // Add key information as system context
  if (keyInfo) {
    context.push({
      role: "system",
      content: keyInfo,
      isSystemMessage: true,
      agentName: targetAgent
    });
  }
  
  // Get most relevant messages for this agent
  // For medical scenario, when targeting preceptor, include patient-student interactions
  // When targeting patient, focus on patient-specific interactions
  if (targetAgent === "preceptor") {
    // Include patient interactions so preceptor has context
    const patientInteractions = messageItems
      .filter(item => item.agentName === "mrKato" || 
                     (item.role === "user" && !item.agentName))
      .slice(-5);
    
    patientInteractions.forEach(item => {
      context.push({
        role: item.role || "system",
        content: item.title || "",
        agentName: item.agentName
      });
    });
    
    // Add previous preceptor messages for continuity
    const preceptorMessages = messageItems
      .filter(item => item.agentName === "preceptor" && 
                     item.role === "assistant")
      .slice(-2);
    
    preceptorMessages.forEach(item => {
      context.push({
        role: "assistant",
        content: item.title || "",
        agentName: item.agentName
      });
    });
  } 
  else if (targetAgent === "mrKato") {
    // For patient, focus on direct interactions
    const patientInteractions = messageItems
      .filter(item => item.agentName === "mrKato" || 
                    (item.role === "user" && !item.agentName))
      .slice(-5);
    
    patientInteractions.forEach(item => {
      context.push({
        role: item.role || "system",
        content: item.title || "",
        agentName: item.agentName
      });
    });
  }
  else {
    // For other agents, use a more generic approach
    // Include recent messages from this agent plus user messages
    const relevantMessages = messageItems
      .filter(item => item.agentName === targetAgent || 
                     (item.role === "user" && !item.agentName))
      .slice(-5);
    
    relevantMessages.forEach(item => {
      context.push({
        role: item.role || "system",
        content: item.title || "",
        agentName: item.agentName
      });
    });
  }
  
  // Ensure system intro is at the beginning
  context = [systemIntro, ...context];
  
  // Apply token limits
  return truncateToTokenLimit(context, maxTokens);
}

/**
 * Extract key information from transcript based on agent role
 */
function extractKeyInformation(
  items: TranscriptItem[],
  targetAgent: string
): string | null {
  // For medical scenario, extract patient information
  if (targetAgent === "preceptor" || targetAgent === "mrKato") {
    // Extract medical keywords (simple approach for Phase 1)
    // In a real implementation, this could use NLP or pattern matching
    const medicalKeywords = [
      "vision problems", "dark spots", "blurry vision", 
      "headaches", "diabetes", "type 2 diabetes",
      "high blood pressure", "medication"
    ];
    
    const relevantItems: string[] = [];
    
    items.forEach(item => {
      if (item.title) {
        for (const keyword of medicalKeywords) {
          if (item.title.toLowerCase().includes(keyword.toLowerCase())) {
            relevantItems.push(item.title);
            break; // Once we find a keyword match, no need to check others
          }
        }
      }
    });
    
    if (relevantItems.length > 0) {
      if (targetAgent === "preceptor") {
        return `Patient Information Summary:\n${relevantItems.join("\n")}`;
      } else {
        return `Your medical history includes:\n${relevantItems.join("\n")}`;
      }
    }
  }
  
  return null;
}

/**
 * Simple token counting and truncation
 * In Phase 4, this will be enhanced with more accurate token counting
 */
export function truncateToTokenLimit(
  context: SimplifiedContext[],
  maxTokens: number
): SimplifiedContext[] {
  let totalTokens = 0;
  const result: SimplifiedContext[] = [];
  
  // Prioritize system messages - always include them if possible
  const systemMessages = context.filter(item => item.isSystemMessage);
  const nonSystemMessages = context.filter(item => !item.isSystemMessage);
  
  // Estimate tokens for system messages (char count / 4)
  for (const item of systemMessages) {
    const tokenEstimate = Math.ceil((item.content.length + 20) / 4);
    totalTokens += tokenEstimate;
    result.push(item);
  }
  
  // Add non-system messages until we hit the limit
  for (const item of nonSystemMessages) {
    const tokenEstimate = Math.ceil((item.content.length + 20) / 4);
    if (totalTokens + tokenEstimate <= maxTokens) {
      result.push(item);
      totalTokens += tokenEstimate;
    } else {
      break;
    }
  }
  
  return result;
}

/**
 * Strategy selector - choose and apply the appropriate context strategy
 */
export function assembleContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  agentConfig?: AgentConfig,
  strategy: "basic" | "agent-aware" | "role-based" = "role-based",
  maxItems: number = DEFAULT_MAX_ITEMS,
  maxTokens: number = DEFAULT_MAX_TOKENS
): SimplifiedContext[] {
  // Choose strategy based on config and parameters
  switch (strategy) {
    case "basic":
      return assembleBasicContext(transcriptItems, maxItems);
    
    case "agent-aware":
      return assembleAgentAwareContext(transcriptItems, targetAgent, maxItems);
    
    case "role-based":
      if (!agentConfig) {
        // Fall back to agent-aware if no agent config is provided
        return assembleAgentAwareContext(transcriptItems, targetAgent, maxItems);
      }
      return assembleRoleBasedContext(
        transcriptItems, 
        targetAgent, 
        agentConfig, 
        maxTokens
      );
    
    default:
      // Default to basic context if invalid strategy
      return assembleBasicContext(transcriptItems, maxItems);
  }
}

/**
 * Format context for API submission
 */
export function formatContextForAPI(context: SimplifiedContext[]): string {
  return context.map(item => `${item.role}: ${item.content}`).join('\n\n');
} 
import { TranscriptItem } from "@/app/types";

/**
 * Context Preservation Test
 * 
 * This module tests different strategies for preserving conversation context
 * during agent transitions when implementing the session reconnection approach.
 */

interface SimplifiedContext {
  role: string;
  content: string;
}

/**
 * Sample transcript data for testing context preservation strategies
 */
export function getSampleTranscript(): TranscriptItem[] {
  const now = Date.now();
  return [
    // Initial conversation with patient (Mr. Kato)
    {
      itemId: "user-1",
      type: "MESSAGE",
      role: "user",
      title: "Hello Dr. Rivera, I've been experiencing vision problems lately.",
      expanded: false,
      timestamp: "10:15:30 AM",
      createdAtMs: now - 7000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato" // This is the agent the message was said to
    },
    {
      itemId: "assistant-1",
      type: "MESSAGE",
      role: "assistant",
      title: "I'm sorry to hear about your vision problems, Mr. Kato. Can you describe exactly what you're experiencing?",
      expanded: false,
      timestamp: "10:15:45 AM",
      createdAtMs: now - 6500,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato" // This is the agent who said this message
    },
    {
      itemId: "user-2",
      type: "MESSAGE",
      role: "user",
      title: "I'm seeing dark spots in my right eye and my vision is getting blurry. It started about a week ago.",
      expanded: false,
      timestamp: "10:16:00 AM",
      createdAtMs: now - 6000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "assistant-2",
      type: "MESSAGE",
      role: "assistant",
      title: "I understand. Those symptoms could indicate several possible conditions. Have you had any eye pain or headaches along with the dark spots and blurry vision?",
      expanded: false,
      timestamp: "10:16:15 AM",
      createdAtMs: now - 5500,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "user-3",
      type: "MESSAGE",
      role: "user",
      title: "Yes, I've had some mild headaches, especially when I read for too long.",
      expanded: false,
      timestamp: "10:16:30 AM",
      createdAtMs: now - 5000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    // Transition to preceptor
    {
      itemId: "breadcrumb-1",
      type: "BREADCRUMB",
      title: "Switching to Preceptor",
      expanded: false,
      timestamp: "10:16:45 AM",
      createdAtMs: now - 4500,
      status: "DONE",
      isHidden: false,
      agentName: "system"
    },
    {
      itemId: "user-4",
      type: "MESSAGE",
      role: "user",
      title: "Dr. Chen, I'm with a patient who's experiencing dark spots, blurry vision, and mild headaches. What additional questions should I ask?",
      expanded: false,
      timestamp: "10:17:00 AM",
      createdAtMs: now - 4000,
      status: "DONE",
      isHidden: false,
      agentName: "preceptor"
    },
    {
      itemId: "assistant-3",
      type: "MESSAGE",
      role: "assistant",
      title: "Good questions so far. You should also ask about the onset and progression of symptoms, any history of diabetes or hypertension, family history of eye conditions, and whether they've experienced any recent trauma to the eye. These will help narrow down whether we're dealing with retinal detachment, macular degeneration, or another condition.",
      expanded: false,
      timestamp: "10:17:15 AM",
      createdAtMs: now - 3500,
      status: "DONE",
      isHidden: false,
      agentName: "preceptor"
    },
    // Back to patient
    {
      itemId: "breadcrumb-2",
      type: "BREADCRUMB",
      title: "Switching back to Patient",
      expanded: false,
      timestamp: "10:17:30 AM",
      createdAtMs: now - 3000,
      status: "DONE",
      isHidden: false,
      agentName: "system"
    },
    {
      itemId: "user-5",
      type: "MESSAGE",
      role: "user",
      title: "Mr. Kato, do you have any history of diabetes or high blood pressure?",
      expanded: false,
      timestamp: "10:17:45 AM",
      createdAtMs: now - 2500,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    },
    {
      itemId: "assistant-4",
      type: "MESSAGE",
      role: "assistant",
      title: "Yes, I was diagnosed with type 2 diabetes about five years ago. I take medication for it. My blood pressure has been normal though.",
      expanded: false,
      timestamp: "10:18:00 AM",
      createdAtMs: now - 2000,
      status: "DONE",
      isHidden: false,
      agentName: "mrKato"
    }
  ];
}

/**
 * Basic context assembly that preserves recent messages chronologically
 */
export function assembleBasicContext(
  transcriptItems: TranscriptItem[],
  maxItems: number = 10
): SimplifiedContext[] {
  // Filter to include only MESSAGE type items
  const messageItems = transcriptItems.filter(item => 
    item.type === "MESSAGE" && !item.isHidden
  );
  
  // Sort by creation time (oldest first)
  const sortedItems = [...messageItems].sort(
    (a, b) => a.createdAtMs - b.createdAtMs
  );
  
  // Take the most recent N items
  const recentItems = sortedItems.slice(Math.max(0, sortedItems.length - maxItems));
  
  // Convert to simplified format
  return recentItems.map(item => ({
    role: item.role || "system",
    content: item.title || ""
  }));
}

/**
 * Agent-aware context assembly that filters by target agent
 */
export function assembleAgentAwareContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  maxItems: number = 10
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
  const recentItems = relevantItems.slice(Math.max(0, relevantItems.length - maxItems));
  
  // Convert to simplified format
  return recentItems.map(item => ({
    role: item.role || "system",
    content: item.title || ""
  }));
}

/**
 * Advanced context assembly that uses agent-specific rules
 */
export function assembleRoleBasedContext(
  transcriptItems: TranscriptItem[],
  targetAgent: string,
  maxTokens: number = 1000 // Approximated token limit
): SimplifiedContext[] {
  // Create a tailored context based on the agent's role
  let context: SimplifiedContext[] = [];
  
  // Create an intro that explains the transition for continuity
  let systemIntro: SimplifiedContext = {
    role: "system",
    content: ""
  };
  
  // Start with chronologically sorted items
  const messageItems = transcriptItems
    .filter(item => item.type === "MESSAGE" && !item.isHidden)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  
  // Extract key medical information
  const medicalInfo = extractMedicalInfo(messageItems);
  
  if (targetAgent === "preceptor") {
    // For preceptor, focus on educational context
    systemIntro.content = 
      "You are a medical instructor guiding a student through a patient case. " +
      "The student has been speaking with the patient and is now consulting with you.";
    
    // Add medical summary
    context.push({
      role: "system",
      content: `Patient Information Summary:\n${medicalInfo}`
    });
    
    // Include recent patient-student interactions (last 5 exchanges)
    const patientInteractions = messageItems
      .filter(item => item.agentName === "mrKato")
      .slice(-5);
    
    patientInteractions.forEach(item => {
      context.push({
        role: item.role || "system",
        content: item.title || ""
      });
    });
    
    // Add previous preceptor messages for continuity
    const preceptorMessages = messageItems
      .filter(item => item.agentName === "preceptor" && item.role === "assistant")
      .slice(-2);
    
    preceptorMessages.forEach(item => {
      context.push({
        role: "assistant",
        content: item.title || ""
      });
    });
  } 
  else if (targetAgent === "mrKato") {
    // For patient, focus on personal medical context
    systemIntro.content = 
      "You are Mr. Kato, a 65-year-old patient with type 2 diabetes who is experiencing vision problems. " +
      "You are speaking with a medical student about your symptoms.";
    
    // Include key patient information
    context.push({
      role: "system",
      content: `Your medical history: ${medicalInfo}`
    });
    
    // Include only direct patient-student interactions (not preceptor conversations)
    const patientStudentInteractions = messageItems
      .filter(item => item.agentName === "mrKato" || (item.role === "user" && item.agentName === "mrKato"))
      .slice(-5);
    
    patientStudentInteractions.forEach(item => {
      context.push({
        role: item.role || "system",
        content: item.title || ""
      });
    });
  }
  
  // Ensure system intro is at the beginning
  context = [systemIntro, ...context];
  
  // Apply token limits
  return truncateToTokenLimit(context, maxTokens);
}

/**
 * Extract key medical information from transcript
 */
function extractMedicalInfo(items: TranscriptItem[]): string {
  // In a real implementation, we'd use NLP or pattern matching
  // For this spike, we'll simulate extraction with hardcoded info
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
  
  return relevantItems.join("\n");
}

/**
 * Simple token counting and truncation
 */
function truncateToTokenLimit(
  context: SimplifiedContext[],
  maxTokens: number
): SimplifiedContext[] {
  let totalTokens = 0;
  const result: SimplifiedContext[] = [];
  
  // Simple token estimation (chars / 4)
  for (const item of context) {
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
 * Test all context assembly strategies and compare results
 */
export function testContextPreservation(): {
  basicContext: SimplifiedContext[];
  agentAwareContext: {
    patient: SimplifiedContext[];
    preceptor: SimplifiedContext[];
  };
  roleBasedContext: {
    patient: SimplifiedContext[];
    preceptor: SimplifiedContext[];
  };
} {
  console.log("=== Context Preservation Test ===");
  
  const sampleTranscript = getSampleTranscript();
  
  // Test basic context assembly
  console.log("\nTesting Basic Context Assembly:");
  const basicContext = assembleBasicContext(sampleTranscript, 5);
  console.log(`Basic context (${basicContext.length} items):`);
  basicContext.forEach((item, i) => {
    console.log(`${i+1}. ${item.role}: ${item.content.substring(0, 40)}...`);
  });
  
  // Test agent-aware context assembly
  console.log("\nTesting Agent-Aware Context Assembly:");
  
  const patientContext = assembleAgentAwareContext(sampleTranscript, "mrKato", 5);
  console.log(`Patient context (${patientContext.length} items):`);
  patientContext.forEach((item, i) => {
    console.log(`${i+1}. ${item.role}: ${item.content.substring(0, 40)}...`);
  });
  
  const preceptorContext = assembleAgentAwareContext(sampleTranscript, "preceptor", 5);
  console.log(`Preceptor context (${preceptorContext.length} items):`);
  preceptorContext.forEach((item, i) => {
    console.log(`${i+1}. ${item.role}: ${item.content.substring(0, 40)}...`);
  });
  
  // Test role-based context assembly
  console.log("\nTesting Role-Based Context Assembly:");
  
  const patientRoleContext = assembleRoleBasedContext(sampleTranscript, "mrKato");
  console.log(`Patient role context (${patientRoleContext.length} items):`);
  patientRoleContext.forEach((item, i) => {
    console.log(`${i+1}. ${item.role}: ${item.content.substring(0, 40)}...`);
  });
  
  const preceptorRoleContext = assembleRoleBasedContext(sampleTranscript, "preceptor");
  console.log(`Preceptor role context (${preceptorRoleContext.length} items):`);
  preceptorRoleContext.forEach((item, i) => {
    console.log(`${i+1}. ${item.role}: ${item.content.substring(0, 40)}...`);
  });
  
  console.log("\nContext preservation test completed.");
  
  return {
    basicContext,
    agentAwareContext: {
      patient: patientContext,
      preceptor: preceptorContext
    },
    roleBasedContext: {
      patient: patientRoleContext,
      preceptor: preceptorRoleContext
    }
  };
}

/**
 * Format context for debugging or API submission
 */
export function formatContextForAPI(context: SimplifiedContext[]): string {
  return context.map(item => `${item.role}: ${item.content}`).join('\n\n');
}

/**
 * Evaluate context assembly strategies by tokens and relevance
 */
export function evaluateContextStrategies(): void {
  const sampleTranscript = getSampleTranscript();
  
  const strategies = [
    {
      name: "Basic Context (5 items)",
      fn: () => assembleBasicContext(sampleTranscript, 5)
    },
    {
      name: "Basic Context (10 items)",
      fn: () => assembleBasicContext(sampleTranscript, 10)
    },
    {
      name: "Agent-Aware (patient, 5 items)",
      fn: () => assembleAgentAwareContext(sampleTranscript, "mrKato", 5)
    },
    {
      name: "Agent-Aware (preceptor, 5 items)",
      fn: () => assembleAgentAwareContext(sampleTranscript, "preceptor", 5)
    },
    {
      name: "Role-Based (patient)",
      fn: () => assembleRoleBasedContext(sampleTranscript, "mrKato")
    },
    {
      name: "Role-Based (preceptor)",
      fn: () => assembleRoleBasedContext(sampleTranscript, "preceptor")
    }
  ];
  
  console.log("\n=== Strategy Evaluation ===");
  console.log("\nStrategy | Items | Tokens | Patient Messages | Preceptor Messages | System Messages");
  console.log("---------|-------|--------|------------------|--------------------|----------------");
  
  strategies.forEach(strategy => {
    const context = strategy.fn();
    
    // Calculate token estimate
    const tokenEstimate = context.reduce((sum, item) => 
      sum + Math.ceil((item.content.length + 20) / 4), 0);
    
    // Count message types
    const patientMessages = context.filter(item => 
      item.role === "assistant" && item.content.includes("Mr. Kato")).length;
    
    const preceptorMessages = context.filter(item => 
      item.role === "assistant" && !item.content.includes("Mr. Kato")).length;
    
    const systemMessages = context.filter(item => 
      item.role === "system").length;
    
    console.log(`${strategy.name.padEnd(10)} | ${context.length.toString().padEnd(6)} | ${tokenEstimate.toString().padEnd(7)} | ${patientMessages.toString().padEnd(17)} | ${preceptorMessages.toString().padEnd(19)} | ${systemMessages}`);
  });
  
  console.log("\nEvaluation complete!");
} 
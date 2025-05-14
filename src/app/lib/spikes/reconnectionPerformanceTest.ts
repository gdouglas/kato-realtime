/**
 * Reconnection Performance Test
 * 
 * This spike tests the performance of the reconnection process when switching
 * between different agent voices (Shimmer for Preceptor, Ash for Mr. Kato).
 * 
 * Test procedure:
 * 1. Connect with initial voice
 * 2. Measure time to establish initial connection
 * 3. Disconnect
 * 4. Reconnect with different voice
 * 5. Measure time to reconnect
 * 6. Test with different context preservation strategies
 * 7. Repeat to get average performance metrics
 */

import { WebRTCManager } from "../webrtcManager";

// Available voices
const VOICES = {
  PRECEPTOR: "shimmer",
  PATIENT: "ash"
};

// Test setup
interface ReconnectionTestConfig {
  initialVoice: string;
  targetVoice: string;
  contextSize: "small" | "medium" | "large";
  contextPreservationStrategy: "basic" | "agent-aware" | "role-based";
}

// Generate mock conversation context based on size
function generateMockContext(size: "small" | "medium" | "large", strategy: string) {
  // Base context for all strategies
  const baseContext = {
    "conversation_id": "mock-conversation-12345",
    "patient_name": "Mr. Kato",
    "chief_complaint": "Chest pain"
  };
  
  // Basic context strategy
  if (strategy === "basic") {
    return {
      ...baseContext,
      "messages": size === "small" ? 
        Array(5).fill({ role: "user", content: "Short message" }) :
        size === "medium" ? 
          Array(15).fill({ role: "user", content: "Medium length message with some context" }) :
          Array(30).fill({ role: "user", content: "Longer message with detailed medical information about the patient's condition" })
    };
  }
  
  // Agent-aware context strategy
  if (strategy === "agent-aware") {
    return {
      ...baseContext,
      "current_agent": "patient",
      "previous_agent": "preceptor",
      "messages": size === "small" ? 
        Array(5).fill({ role: "user", content: "Short message", agent: "patient" }) :
        size === "medium" ? 
          Array(15).fill({ role: "user", content: "Medium length message", agent: "preceptor" }) :
          Array(30).fill({ role: "user", content: "Longer message with details", agent: ["patient", "preceptor"][Math.floor(Math.random() * 2)] })
    };
  }
  
  // Role-based context strategy
  if (strategy === "role-based") {
    return {
      ...baseContext,
      "roles": {
        "preceptor": {
          "context": "You are a medical instructor guiding the student",
          "messages": size === "small" ? Array(3).fill("Instructor message") : Array(10).fill("Detailed instructor guidance")
        },
        "patient": {
          "context": "You are Mr. Kato, a 65-year-old male with chest pain",
          "messages": size === "small" ? Array(3).fill("Patient response") : Array(10).fill("Detailed patient history")
        }
      }
    };
  }
  
  return baseContext;
}

// Run a single reconnection test
async function runSingleReconnectionTest(
  ephemeralKey: string, 
  config: ReconnectionTestConfig
): Promise<{
  initialConnectionTime: number;
  disconnectionTime: number;
  reconnectionTime: number;
  contextSize: string;
  strategy: string;
  success: boolean;
}> {
  // Test metrics
  let initialConnectionTime = 0;
  let disconnectionTime = 0;
  let reconnectionTime = 0;
  let success = false;
  
  try {
    console.log(`Running reconnection test with ${config.initialVoice} -> ${config.targetVoice} (${config.contextSize} context, ${config.contextPreservationStrategy} strategy)`);
    
    // Create audio element
    const audioElement = new Audio();
    audioElement.autoplay = true;
    
    // Initialize manager
    const manager = new WebRTCManager();
    
    // --- PHASE 1: Initial Connection ---
    console.log("Phase 1: Initial connection");
    const initialStart = performance.now();
    
    const initialConnectSuccess = await manager.connect(
      ephemeralKey, 
      audioElement,
      "opus",
      (data) => console.log("Data received:", data),
      (status) => console.log("Status changed:", status),
      (error) => console.error("Error:", error)
    );
    
    initialConnectionTime = performance.now() - initialStart;
    console.log(`Initial connection ${initialConnectSuccess ? "successful" : "failed"} in ${initialConnectionTime}ms`);
    
    if (!initialConnectSuccess) {
      throw new Error("Initial connection failed");
    }
    
    // Update session with initial voice
    const sessionUpdateSuccess = manager.updateSession(
      "You are a medical education simulation", 
      config.initialVoice
    );
    
    console.log(`Initial session update ${sessionUpdateSuccess ? "successful" : "failed"}`);
    
    // Generate context based on configuration
    const context = generateMockContext(config.contextSize, config.contextPreservationStrategy);
    
    // Save the context (simulating the real application saving to localStorage)
    console.log("Saving context:", context);
    
    // Wait a moment with the initial connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // --- PHASE 2: Disconnection ---
    console.log("Phase 2: Disconnection");
    const disconnectStart = performance.now();
    
    manager.disconnect();
    
    disconnectionTime = performance.now() - disconnectStart;
    console.log(`Disconnection completed in ${disconnectionTime}ms`);
    
    // Wait briefly between disconnection and reconnection
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // --- PHASE 3: Reconnection with new voice ---
    console.log("Phase 3: Reconnection with new voice");
    const reconnectStart = performance.now();
    
    // Create a new manager for reconnection
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
    
    // Update session with new voice and include preserved context
    const reconnectUpdateSuccess = newManager.updateSession(
      JSON.stringify(context), 
      config.targetVoice
    );
    
    reconnectionTime = performance.now() - reconnectStart;
    console.log(`Reconnection ${reconnectUpdateSuccess ? "successful" : "failed"} in ${reconnectionTime}ms`);
    
    // Wait a moment with the new connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Clean up
    newManager.disconnect();
    
    success = true;
    return {
      initialConnectionTime,
      disconnectionTime,
      reconnectionTime,
      contextSize: config.contextSize,
      strategy: config.contextPreservationStrategy,
      success
    };
  } catch (error) {
    console.error("Reconnection test failed:", error);
    return {
      initialConnectionTime,
      disconnectionTime,
      reconnectionTime,
      contextSize: config.contextSize,
      strategy: config.contextPreservationStrategy,
      success: false
    };
  }
}

// Run a full suite of tests
export async function runReconnectionPerformanceTests(ephemeralKey: string) {
  console.log("Starting reconnection performance tests");
  
  const results = [];
  
  // Test configurations
  const testConfigurations: ReconnectionTestConfig[] = [
    // Test each context preservation strategy with small context
    { initialVoice: VOICES.PRECEPTOR, targetVoice: VOICES.PATIENT, contextSize: "small", contextPreservationStrategy: "basic" },
    { initialVoice: VOICES.PRECEPTOR, targetVoice: VOICES.PATIENT, contextSize: "small", contextPreservationStrategy: "agent-aware" },
    { initialVoice: VOICES.PRECEPTOR, targetVoice: VOICES.PATIENT, contextSize: "small", contextPreservationStrategy: "role-based" },
    
    // Test medium and large context sizes with the fastest strategy
    { initialVoice: VOICES.PATIENT, targetVoice: VOICES.PRECEPTOR, contextSize: "medium", contextPreservationStrategy: "basic" },
    { initialVoice: VOICES.PATIENT, targetVoice: VOICES.PRECEPTOR, contextSize: "large", contextPreservationStrategy: "basic" },
  ];
  
  // Run each test configuration
  for (const config of testConfigurations) {
    const result = await runSingleReconnectionTest(ephemeralKey, config);
    results.push(result);
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Analyze results
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    const avgReconnectTime = successfulResults.reduce((sum, r) => sum + r.reconnectionTime, 0) / successfulResults.length;
    console.log(`Average reconnection time: ${avgReconnectTime}ms`);
    
    // Find fastest strategy
    const strategyTimes: Record<string, number[]> = {};
    successfulResults.forEach(r => {
      if (!strategyTimes[r.strategy]) {
        strategyTimes[r.strategy] = [];
      }
      strategyTimes[r.strategy].push(r.reconnectionTime);
    });
    
    for (const [strategy, times] of Object.entries(strategyTimes)) {
      const avgTime = times.reduce((sum: number, time: number) => sum + time, 0) / times.length;
      console.log(`Strategy ${strategy} average time: ${avgTime}ms`);
    }
  }
  
  console.log("Test results:", results);
  return results;
}

// To use this test, call:
// import { runReconnectionPerformanceTests } from './lib/spikes/reconnectionPerformanceTest';
// runReconnectionPerformanceTests('your-ephemeral-key'); 
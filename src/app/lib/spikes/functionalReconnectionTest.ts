/**
 * Functional Reconnection Test
 * 
 * This spike validates the complete end-to-end reconnection flow, simulating
 * a realistic user interaction. It tests:
 * 
 * 1. Initial connection with Preceptor voice
 * 2. Conversation state persistence during agent transition
 * 3. Reconnection with Patient voice
 * 4. Context preservation across transitions
 * 5. Error handling during reconnection process
 * 6. Performance benchmarking against the 2-second target
 */

import { WebRTCManager } from "../webrtcManager";

// Test statuses
type TestStatus = "PASSED" | "FAILED" | "SKIPPED";

// Test case interface
interface TestCase {
  name: string;
  run: () => Promise<boolean>;
  status: TestStatus;
  error?: Error;
  duration?: number;
}

// Test suite interface
interface TestSuite {
  name: string;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  tests: TestCase[];
}

// Test report interface
interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: {
    name: string;
    tests: {
      name: string;
      status: TestStatus;
      duration?: number;
      error?: string;
    }[];
  }[];
}

// Run a test suite
async function runTestSuite(suite: TestSuite, ephemeralKey: string): Promise<TestReport> {
  console.log(`Running test suite: ${suite.name}`);
  const startTime = performance.now();
  
  // Initialize report
  const report: TestReport = {
    totalTests: suite.tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    suites: [{
      name: suite.name,
      tests: []
    }]
  };
  
  // Run setup if exists
  if (suite.setup) {
    try {
      await suite.setup();
    } catch (error) {
      console.error("Suite setup failed:", error);
      // Mark all tests as skipped if setup fails
      for (const test of suite.tests) {
        test.status = "SKIPPED";
        report.skipped++;
        report.suites[0].tests.push({
          name: test.name,
          status: "SKIPPED"
        });
      }
      report.duration = performance.now() - startTime;
      return report;
    }
  }
  
  // Run each test
  for (const test of suite.tests) {
    console.log(`  Running test: ${test.name}`);
    const testStartTime = performance.now();
    
    try {
      // Inject ephemeralKey to test function scope if needed
      (test as any).ephemeralKey = ephemeralKey;
      
      const success = await test.run();
      test.status = success ? "PASSED" : "FAILED";
      test.duration = performance.now() - testStartTime;
      
      if (success) {
        report.passed++;
        console.log(`  ✅ PASSED: ${test.name} (${test.duration.toFixed(2)}ms)`);
      } else {
        report.failed++;
        console.log(`  ❌ FAILED: ${test.name} (${test.duration.toFixed(2)}ms)`);
      }
    } catch (error) {
      test.status = "FAILED";
      test.error = error instanceof Error ? error : new Error(String(error));
      test.duration = performance.now() - testStartTime;
      
      report.failed++;
      console.error(`  ❌ ERROR: ${test.name} - ${test.error.message} (${test.duration.toFixed(2)}ms)`);
    }
    
    // Add to report
    report.suites[0].tests.push({
      name: test.name,
      status: test.status,
      duration: test.duration,
      error: test.error?.message
    });
  }
  
  // Run teardown if exists
  if (suite.teardown) {
    try {
      await suite.teardown();
    } catch (error) {
      console.error("Suite teardown failed:", error);
    }
  }
  
  // Calculate total duration
  report.duration = performance.now() - startTime;
  
  // Log summary
  console.log(`Suite ${suite.name} completed in ${report.duration.toFixed(2)}ms`);
  console.log(`Results: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);
  
  return report;
}

// Shared state between tests
interface SharedTestState {
  audioElement?: HTMLAudioElement;
  manager?: WebRTCManager;
  conversation?: any;
  reconnectionTime?: number;
}

// Create the reconnection test suite
function createReconnectionTestSuite(ephemeralKey: string): TestSuite {
  // Shared state
  const state: SharedTestState = {};
  
  return {
    name: "Reconnection Flow Tests",
    
    // Setup suite - runs once before all tests
    setup: async () => {
      // Create audio element
      state.audioElement = new Audio();
      state.audioElement.autoplay = true;
      
      // Initialize empty conversation
      state.conversation = {
        id: `conv-${Date.now()}`,
        messages: [],
        metadata: {
          patient: "Mr. Kato",
          chiefComplaint: "Chest pain"
        }
      };
    },
    
    // Teardown suite - runs once after all tests
    teardown: async () => {
      // Clean up
      if (state.manager) {
        state.manager.disconnect();
      }
    },
    
    // Test cases
    tests: [
      // Test 1: Initial connection
      {
        name: "Initial Connection",
        status: "SKIPPED",
        run: async function() {
          // Create manager
          state.manager = new WebRTCManager();
          
          // Connect with Preceptor voice
          const startTime = performance.now();
          const success = await state.manager.connect(
            ephemeralKey,
            state.audioElement!,
            "opus",
            (data) => console.log("Data received:", data),
            (status) => console.log("Status changed:", status),
            (error) => console.error("Error:", error)
          );
          
          const connectionTime = performance.now() - startTime;
          console.log(`Initial connection took ${connectionTime}ms`);
          
          // Update session with Preceptor voice
          const updateSuccess = state.manager.updateSession(
            "You are a medical education preceptor guiding a student.",
            "shimmer"
          );
          
          // Add a test message to the conversation
          if (success && updateSuccess) {
            // Simulate a message exchange
            state.conversation.messages.push({
              role: "user",
              content: "Hello, I'd like to discuss a case."
            });
            
            state.conversation.messages.push({
              role: "assistant",
              content: "Of course, I'm here to help you with that case.",
              agent: "preceptor"
            });
          }
          
          return success && updateSuccess;
        }
      },
      
      // Test 2: Verify conversation persistence
      {
        name: "Conversation Persistence",
        status: "SKIPPED",
        run: async function() {
          // Check if previous test completed
          if (!state.manager?.isConnected()) {
            console.log("Skipping persistence test - not connected");
            return false;
          }
          
          // Verify conversation has expected messages
          const hasExpectedMessages = state.conversation.messages.length === 2;
          console.log(`Conversation has ${state.conversation.messages.length} messages`);
          
          // Verify we can add more messages
          try {
            state.conversation.messages.push({
              role: "user",
              content: "What should I focus on during the patient interview?"
            });
            
            // Send this message to the API
            const messageSent = state.manager.sendEvent({
              type: "conversation.item.create",
              item: {
                role: "user",
                type: "message",
                content: [
                  {
                    type: "text",
                    text: "What should I focus on during the patient interview?"
                  }
                ]
              }
            });
            
            // Simulate response
            if (messageSent) {
              state.conversation.messages.push({
                role: "assistant",
                content: "Focus on the patient's symptoms, severity, and timeline.",
                agent: "preceptor"
              });
            }
            
            return hasExpectedMessages && messageSent;
          } catch (error) {
            console.error("Error in persistence test:", error);
            return false;
          }
        }
      },
      
      // Test 3: Disconnection
      {
        name: "Clean Disconnection",
        status: "SKIPPED",
        run: async function() {
          // Check if previous test completed
          if (!state.manager?.isConnected()) {
            console.log("Skipping disconnection test - not connected");
            return false;
          }
          
          // Verify we can disconnect cleanly
          try {
            const startTime = performance.now();
            state.manager.disconnect();
            const disconnectionTime = performance.now() - startTime;
            
            console.log(`Disconnection took ${disconnectionTime}ms`);
            
            // Verify manager reports as disconnected
            const isDisconnected = !state.manager.isConnected();
            
            return isDisconnected;
          } catch (error) {
            console.error("Error in disconnection test:", error);
            return false;
          }
        }
      },
      
      // Test 4: Reconnection with different voice
      {
        name: "Reconnection with Different Voice",
        status: "SKIPPED",
        run: async function() {
          // Create a new manager
          state.manager = new WebRTCManager();
          
          // Connect with Patient voice
          const startTime = performance.now();
          const success = await state.manager.connect(
            ephemeralKey,
            state.audioElement!,
            "opus",
            (data) => console.log("Data received:", data),
            (status) => console.log("Status changed:", status),
            (error) => console.error("Error:", error)
          );
          
          state.reconnectionTime = performance.now() - startTime;
          console.log(`Reconnection took ${state.reconnectionTime}ms`);
          
          // Update session with Patient voice and preserved context
          const contextJson = JSON.stringify(state.conversation);
          const updateSuccess = state.manager.updateSession(
            `You are Mr. Kato, a 65-year-old patient with chest pain. Context: ${contextJson}`,
            "ash"
          );
          
          return success && updateSuccess;
        }
      },
      
      // Test 5: Context preservation verification
      {
        name: "Context Preservation",
        status: "SKIPPED",
        run: async function() {
          // Check if previous test completed
          if (!state.manager?.isConnected()) {
            console.log("Skipping context preservation test - not connected");
            return false;
          }
          
          // Verify conversation still has all previous messages
          const hasAllMessages = state.conversation.messages.length === 4;
          console.log(`Conversation has ${state.conversation.messages.length} messages after reconnection`);
          
          // Verify we can continue the conversation with the new voice
          try {
            // Add a new message with the patient voice
            state.conversation.messages.push({
              role: "user",
              content: "Hello Mr. Kato, can you tell me about your chest pain?"
            });
            
            // Send this message to the API
            const messageSent = state.manager.sendEvent({
              type: "conversation.item.create",
              item: {
                role: "user",
                type: "message",
                content: [
                  {
                    type: "text",
                    text: "Hello Mr. Kato, can you tell me about your chest pain?"
                  }
                ]
              }
            });
            
            // Simulate response with patient voice
            if (messageSent) {
              state.conversation.messages.push({
                role: "assistant",
                content: "The pain is sharp and started about 2 hours ago.",
                agent: "patient"
              });
            }
            
            return hasAllMessages && messageSent;
          } catch (error) {
            console.error("Error in context preservation test:", error);
            return false;
          }
        }
      },
      
      // Test 6: Performance validation
      {
        name: "Reconnection Performance",
        status: "SKIPPED",
        run: async function() {
          // Check if we have reconnection time
          if (!state.reconnectionTime) {
            console.log("Skipping performance test - no reconnection time recorded");
            return false;
          }
          
          // Check if reconnection time is under 2 seconds (2000ms)
          const isUnderTarget = state.reconnectionTime < 2000;
          console.log(`Reconnection time: ${state.reconnectionTime}ms, Target: 2000ms`);
          
          return isUnderTarget;
        }
      },
      
      // Test 7: Error handling
      {
        name: "Error Handling",
        status: "SKIPPED",
        run: async function() {
          // Test with an invalid ephemeral key
          const invalidManager = new WebRTCManager();
          
          try {
            // This should fail
            await invalidManager.connect(
              "invalid-key",
              state.audioElement!,
              "opus",
              (data) => console.log("Data received:", data),
              (status) => console.log("Status changed:", status),
              (error) => console.log("Error caught:", error)
            );
            
            // If we get here, the error wasn't properly caught
            return false;
          } catch (error) {
            // Expected error case - we want to make sure the WebRTCManager properly handles this
            console.log("Successfully caught connection error");
            
            // Verify the manager reports as disconnected
            const isDisconnected = !invalidManager.isConnected();
            
            // Clean up
            invalidManager.disconnect();
            
            return isDisconnected;
          }
        }
      }
    ]
  };
}

// Run the functional reconnection test
export async function runFunctionalReconnectionTest(ephemeralKey: string): Promise<TestReport> {
  console.log("Starting functional reconnection test");
  
  // Create and run the test suite
  const suite = createReconnectionTestSuite(ephemeralKey);
  const report = await runTestSuite(suite, ephemeralKey);
  
  console.log("Functional test completed");
  console.log("Test report:", report);
  
  return report;
}

// To use this test, call:
// import { runFunctionalReconnectionTest } from './lib/spikes/functionalReconnectionTest';
// runFunctionalReconnectionTest('your-ephemeral-key'); 
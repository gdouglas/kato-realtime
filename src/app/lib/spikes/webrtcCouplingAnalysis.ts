import { SessionStatus } from "@/app/types";

/**
 * WebRTC Coupling Analysis
 * 
 * This module analyzes the coupling points in the current WebRTC implementation
 * in App.tsx and related components. It helps identify areas that need to be
 * abstracted to support the session reconnection approach.
 */

export interface CouplingPoint {
  name: string;
  type: string;
  component: string;
  coupling: "High" | "Medium" | "Low";
  notes: string;
}

export interface CouplingAnalysisResult {
  stateVariables: CouplingPoint[];
  refs: CouplingPoint[];
  methods: CouplingPoint[];
  eventHandlers: CouplingPoint[];
  dependencies: CouplingPoint[];
  recommendation: string;
}

/**
 * Analyzes the WebRTC coupling in the codebase
 */
export function analyzeWebRTCCoupling(): CouplingAnalysisResult {
  return {
    // State variables directly coupled to WebRTC
    stateVariables: [
      {
        name: "dataChannel",
        type: "RTCDataChannel | null",
        component: "App.tsx",
        coupling: "High",
        notes: "State variable directly stores WebRTC data channel"
      },
      {
        name: "sessionStatus",
        type: "SessionStatus",
        component: "App.tsx",
        coupling: "High",
        notes: "Controls UI rendering based on WebRTC connection state"
      },
      {
        name: "isOutputAudioBufferActive",
        type: "boolean",
        component: "App.tsx",
        coupling: "Medium",
        notes: "Tracks audio buffer state from WebRTC events"
      }
    ],
    
    // Refs that store WebRTC objects
    refs: [
      {
        name: "pcRef",
        type: "useRef<RTCPeerConnection | null>",
        component: "App.tsx",
        coupling: "High",
        notes: "Stores RTCPeerConnection instance directly in the component"
      },
      {
        name: "dcRef",
        type: "useRef<RTCDataChannel | null>",
        component: "App.tsx",
        coupling: "High",
        notes: "Stores RTCDataChannel instance used throughout the component"
      },
      {
        name: "audioElementRef",
        type: "useRef<HTMLAudioElement | null>",
        component: "App.tsx",
        coupling: "Medium",
        notes: "Connected to WebRTC audio output"
      },
      {
        name: "handleServerEventRef",
        type: "useRef<Function>",
        component: "App.tsx",
        coupling: "Medium",
        notes: "Handles WebRTC data channel messages"
      }
    ],
    
    // Methods with WebRTC dependencies
    methods: [
      {
        name: "connectToRealtime",
        type: "async function",
        component: "App.tsx",
        coupling: "High",
        notes: "Sets up WebRTC connection and event handlers"
      },
      {
        name: "disconnectFromRealtime",
        type: "function",
        component: "App.tsx",
        coupling: "High",
        notes: "Cleans up WebRTC resources directly"
      },
      {
        name: "sendClientEvent",
        type: "function",
        component: "App.tsx",
        coupling: "High",
        notes: "Sends messages through WebRTC data channel"
      },
      {
        name: "updateSession",
        type: "function",
        component: "App.tsx",
        coupling: "Medium",
        notes: "Updates session settings through WebRTC"
      },
      {
        name: "cancelAssistantSpeech",
        type: "async function",
        component: "App.tsx",
        coupling: "Medium",
        notes: "Interacts with WebRTC to cancel speech"
      }
    ],
    
    // Event handlers connected to WebRTC
    eventHandlers: [
      {
        name: "data channel open handler",
        type: "event listener",
        component: "App.tsx (connectToRealtime)",
        coupling: "Medium",
        notes: "Inline event handler for data channel open"
      },
      {
        name: "data channel close handler",
        type: "event listener",
        component: "App.tsx (connectToRealtime)",
        coupling: "Medium",
        notes: "Inline event handler for data channel close"
      },
      {
        name: "data channel error handler",
        type: "event listener",
        component: "App.tsx (connectToRealtime)",
        coupling: "Medium",
        notes: "Inline event handler for data channel errors"
      },
      {
        name: "data channel message handler",
        type: "event listener",
        component: "App.tsx (connectToRealtime)",
        coupling: "High",
        notes: "Routes messages to handleServerEvent function"
      }
    ],
    
    // External dependencies relying on WebRTC
    dependencies: [
      {
        name: "useHandleServerEvent",
        type: "custom hook",
        component: "hooks/useHandleServerEvent.ts",
        coupling: "High",
        notes: "Processes WebRTC messages and updates application state"
      },
      {
        name: "createRealtimeConnection",
        type: "function",
        component: "lib/realtimeConnection.ts",
        coupling: "Medium",
        notes: "Encapsulates WebRTC connection setup, but tightly integrated with App.tsx"
      },
      {
        name: "TranscriptContext",
        type: "React context",
        component: "contexts/TranscriptContext.tsx",
        coupling: "Medium",
        notes: "Receives updates based on WebRTC events"
      },
      {
        name: "EventContext",
        type: "React context",
        component: "contexts/EventContext.tsx",
        coupling: "Medium",
        notes: "Logs WebRTC events"
      }
    ],
    
    // Recommendation for abstraction
    recommendation: `
Based on the coupling analysis, here are the key recommendations:

1. Create a WebRTC Manager Class
   - Encapsulate all WebRTC connection logic
   - Handle connection lifecycle (connect, disconnect, reconnect)
   - Manage event listeners
   - Provide a clean interface for sending events

2. Create a React Hook (useWebRTC)
   - Wrap the WebRTC Manager for React components
   - Expose connection status as React state
   - Provide React-friendly methods for interaction
   - Handle cleanup on component unmount

3. Refactoring App.tsx
   - Replace direct WebRTC state and refs with hook usage
   - Move WebRTC-specific logic to the manager
   - Use the hooks' interface for all WebRTC operations
   - Maintain the same functionality but with cleaner separation

4. Modify useHandleServerEvent
   - Accept message handler callbacks instead of direct state setters
   - Decouple from specific component implementations
   - Make it work with the WebRTC abstraction

This approach will significantly reduce coupling while maintaining all current functionality, making the session reconnection approach much easier to implement.
    `
  };
}

/**
 * Utility to check the coupling score of the current implementation
 */
export function calculateCouplingScore(): { score: number; maxScore: 100; assessment: string } {
  const analysis = analyzeWebRTCCoupling();
  
  // Count high coupling points
  const highCouplingCount = 
    analysis.stateVariables.filter(item => item.coupling === "High").length +
    analysis.refs.filter(item => item.coupling === "High").length +
    analysis.methods.filter(item => item.coupling === "High").length +
    analysis.eventHandlers.filter(item => item.coupling === "High").length +
    analysis.dependencies.filter(item => item.coupling === "High").length;
    
  // Count medium coupling points  
  const mediumCouplingCount =
    analysis.stateVariables.filter(item => item.coupling === "Medium").length +
    analysis.refs.filter(item => item.coupling === "Medium").length +
    analysis.methods.filter(item => item.coupling === "Medium").length +
    analysis.eventHandlers.filter(item => item.coupling === "Medium").length +
    analysis.dependencies.filter(item => item.coupling === "Medium").length;
    
  // Calculate a score where lower is better (less coupling)
  // High coupling: 3 points, Medium coupling: 1 point
  const couplingPoints = (highCouplingCount * 3) + mediumCouplingCount;
  
  // Total possible points based on number of items analyzed
  const totalItems = 
    analysis.stateVariables.length +
    analysis.refs.length +
    analysis.methods.length +
    analysis.eventHandlers.length +
    analysis.dependencies.length;
  
  // Maximum possible bad score (if everything were high coupling)
  const maxBadScore = totalItems * 3;
  
  // Convert to a 0-100 score where 100 is good (no coupling)
  const score = Math.max(0, Math.min(100, Math.round(100 - (couplingPoints / maxBadScore * 100))));
  
  // Assessment of the coupling
  let assessment = "";
  if (score < 30) {
    assessment = "High coupling. Significant refactoring is necessary for the session reconnection approach.";
  } else if (score < 60) {
    assessment = "Moderate coupling. Abstraction is needed but manageable with the proposed plan.";
  } else if (score < 80) {
    assessment = "Low coupling. Some abstraction would still be beneficial for the session reconnection approach.";
  } else {
    assessment = "Minimal coupling. The codebase is already well-structured for the session reconnection approach.";
  }
  
  return { score, maxScore: 100, assessment };
}

/**
 * Generate concrete migration guidance for the abstraction
 */
export function generateMigrationSteps(): string[] {
  return [
    "1. Create WebRTCManager class in src/app/lib/webrtcManager.ts",
    "2. Implement useWebRTC hook in src/app/hooks/useWebRTC.ts",
    "3. Update App.tsx to use the useWebRTC hook instead of direct WebRTC management",
    "4. Modify useHandleServerEvent to accept message callbacks instead of state setters",
    "5. Test basic connection functionality with the new abstraction",
    "6. Implement disconnection and reconnection in the WebRTCManager",
    "7. Add context preservation during reconnection",
    "8. Test the full reconnection flow with voice changes"
  ];
}

/**
 * Display the coupling analysis in a user-friendly format
 */
export function displayCouplingAnalysis(): string {
  const analysis = analyzeWebRTCCoupling();
  const score = calculateCouplingScore();
  
  return `
# WebRTC Coupling Analysis

## Coupling Score: ${score.score}/100
${score.assessment}

## Coupling Points

### State Variables (${analysis.stateVariables.length})
${analysis.stateVariables.map(item => `- ${item.name}: ${item.coupling} coupling - ${item.notes}`).join('\n')}

### Refs (${analysis.refs.length})
${analysis.refs.map(item => `- ${item.name}: ${item.coupling} coupling - ${item.notes}`).join('\n')}

### Methods (${analysis.methods.length})
${analysis.methods.map(item => `- ${item.name}: ${item.coupling} coupling - ${item.notes}`).join('\n')}

### Event Handlers (${analysis.eventHandlers.length})
${analysis.eventHandlers.map(item => `- ${item.name}: ${item.coupling} coupling - ${item.notes}`).join('\n')}

### Dependencies (${analysis.dependencies.length})
${analysis.dependencies.map(item => `- ${item.name}: ${item.coupling} coupling - ${item.notes}`).join('\n')}

## Recommendation
${analysis.recommendation}

## Migration Steps
${generateMigrationSteps().join('\n')}
  `;
} 
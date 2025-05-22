# Transition User Experience

## Overview

The Transition User Experience (UX) component provides visual feedback and state indication during agent transitions. This ensures users understand what's happening when the system disconnects and reconnects to switch between different voice agents, maintaining a seamless and intuitive experience despite the brief interruption in service.

## Key Components

### 1. Transition State Indicator

A visual indicator to communicate the current transition state:

```typescript
type TransitionState = "idle" | "preparing" | "disconnecting" | "connecting" | "connected" | "failed";

function TransitionIndicator({ state }: { state: TransitionState }) {
  // Render appropriate indicator based on transition state
  const messages = {
    idle: "",
    preparing: "Preparing to switch agents...",
    disconnecting: "Switching to new agent...",
    connecting: "Connecting to agent...",
    connected: "Connected to new agent",
    failed: "Connection failed. Please try again."
  };
  
  // Only render when not idle
  if (state === "idle") {
    return null;
  }
  
  return (
    <div className="transition-indicator">
      <div className="transition-spinner" />
      <div className="transition-message">{messages[state]}</div>
    </div>
  );
}
```

### 2. Progress Visualization

Subtly communicate the progress of the transition to maintain user engagement:

```typescript
function TransitionProgress({ 
  state, 
  progress, 
  fromAgent, 
  toAgent 
}: { 
  state: TransitionState;
  progress: number;
  fromAgent?: string;
  toAgent?: string;
}) {
  // Only render during active transition
  if (state === "idle" || state === "connected") {
    return null;
  }
  
  return (
    <div className="transition-progress-container">
      <div className="transition-agents">
        {fromAgent && <div className="from-agent">{fromAgent}</div>}
        {fromAgent && toAgent && <div className="agent-arrow">→</div>}
        {toAgent && <div className="to-agent">{toAgent}</div>}
      </div>
      <div className="progress-bar-container">
        <div 
          className="progress-bar" 
          style={{ width: `${progress}%` }} 
        />
      </div>
    </div>
  );
}
```

### 3. Input Disabling

Prevent user interaction during transitions to avoid conflicts:

```typescript
function useInputDisabling(transitionState: TransitionState) {
  // Disable input during active transitions
  const isInputDisabled = 
    transitionState !== "idle" && 
    transitionState !== "connected";
  
  return {
    isInputDisabled,
    inputDisabledMessage: isInputDisabled 
      ? "Please wait while switching between agents..." 
      : undefined
  };
}
```

### 4. Transition Overlay

For longer transitions, provide a full-screen overlay:

```typescript
function TransitionOverlay({ 
  isVisible, 
  fromAgent, 
  toAgent 
}: { 
  isVisible: boolean;
  fromAgent?: string;
  toAgent?: string;
}) {
  if (!isVisible) {
    return null;
  }
  
  return (
    <div className="transition-overlay">
      <div className="transition-card">
        <div className="transition-title">
          Switching Agents
        </div>
        <div className="transition-agents">
          <div className="agent-avatar from">{fromAgent?.charAt(0) || '?'}</div>
          <div className="transition-arrow">→</div>
          <div className="agent-avatar to">{toAgent?.charAt(0) || '?'}</div>
        </div>
        <div className="transition-message">
          Maintaining conversation context...
        </div>
        <div className="spinner-container">
          <div className="spinner" />
        </div>
      </div>
    </div>
  );
}
```

## Integration Points

The Transition UX components will be integrated with:

1. **App.tsx**: To access and display the current transition state
2. **Session Reconnection Handler**: To receive state updates and timing information
3. **BottomToolbar Component**: To disable input controls during transitions
4. **CSS Styles**: To ensure consistent visual language with the existing UI

## Implementation

### 1. Create Component Files

New component files in the UI folder:

- `src/app/components/TransitionIndicator.tsx`
- `src/app/components/TransitionProgress.tsx`
- `src/app/components/TransitionOverlay.tsx`

### 2. Add CSS Styles

Create styles that match the existing application theme:

```css
/* Transition UX styles */

.transition-indicator {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--bg-highlight);
  border-radius: 4px;
  margin: 8px 0;
}

.transition-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.transition-message {
  margin-left: 12px;
  font-size: 14px;
  color: var(--text-primary);
}

.transition-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.transition-card {
  background-color: var(--bg-primary);
  border-radius: 8px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.transition-agents {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 24px 0;
}

.agent-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
}

.agent-avatar.from {
  background-color: var(--secondary-color);
}

.agent-avatar.to {
  background-color: var(--primary-color);
}

.transition-arrow {
  margin: 0 20px;
  font-size: 24px;
  color: var(--text-secondary);
}

.progress-bar-container {
  width: 100%;
  height: 4px;
  background-color: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary-color);
  transition: width 0.3s ease;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 3. Add Transition State to App.tsx

```typescript
// In App.tsx
const [transitionState, setTransitionState] = useState<TransitionState>("idle");
const [transitionProgress, setTransitionProgress] = useState<number>(0);
const [transitionFromAgent, setTransitionFromAgent] = useState<string | undefined>();
const [transitionToAgent, setTransitionToAgent] = useState<string | undefined>();
```

### 4. Create Hook for Transition Management

```typescript
// src/app/hooks/useTransitionState.ts
import { useState, useEffect, useCallback } from 'react';

type TransitionState = "idle" | "preparing" | "disconnecting" | "connecting" | "connected" | "failed";

export function useTransitionState() {
  const [state, setState] = useState<TransitionState>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [fromAgent, setFromAgent] = useState<string | undefined>();
  const [toAgent, setToAgent] = useState<string | undefined>();
  
  const startTransition = useCallback((from: string, to: string) => {
    setFromAgent(from);
    setToAgent(to);
    setState("preparing");
    setProgress(10);
  }, []);
  
  const updateTransitionState = useCallback((newState: TransitionState, newProgress?: number) => {
    setState(newState);
    if (newProgress !== undefined) {
      setProgress(newProgress);
    } else {
      // Auto-calculate progress based on state
      switch (newState) {
        case "preparing": setProgress(20); break;
        case "disconnecting": setProgress(40); break;
        case "connecting": setProgress(60); break;
        case "connected": setProgress(100); break;
        case "failed": setProgress(0); break;
        default: break;
      }
    }
  }, []);
  
  const resetTransition = useCallback(() => {
    // Reset after showing "connected" state briefly
    const resetTimeout = setTimeout(() => {
      setState("idle");
      setProgress(0);
      setFromAgent(undefined);
      setToAgent(undefined);
    }, 2000);
    
    return () => clearTimeout(resetTimeout);
  }, []);
  
  // Auto-reset when reaching 'connected' state
  useEffect(() => {
    if (state === "connected") {
      resetTransition();
    }
  }, [state, resetTransition]);
  
  return {
    state,
    progress,
    fromAgent,
    toAgent,
    startTransition,
    updateTransitionState,
    resetTransition,
    isTransitioning: state !== "idle" && state !== "connected"
  };
}
```

## User Experience Considerations

1. **Timing**:
   - Keep transitions under 3 seconds when possible
   - Provide immediate visual feedback (within 100ms)
   - Set realistic expectations for reconnection time

2. **Messaging**:
   - Use simple, clear language to explain the transition
   - Avoid technical terms like "WebRTC" or "reconnection"
   - Focus on agent identity rather than technical process

3. **Error Handling**:
   - Provide clear recovery options if transition fails
   - Allow manual reconnection attempts
   - Preserve context even during failed transitions

4. **Accessibility**:
   - Ensure transition states are announced to screen readers
   - Maintain keyboard focus appropriately during transitions
   - Use sufficient color contrast for transition indicators

## Technical Considerations

1. **Performance**:
   - Minimize DOM updates during transitions
   - Avoid complex animations that could impact performance
   - Use CSS transitions rather than JavaScript animations when possible

2. **Responsiveness**:
   - Ensure transition UI works on all device sizes
   - Adapt overlay size based on viewport
   - Use relative units for spacing and sizing

3. **Testing**:
   - Test with simulated slow connections
   - Verify behavior with browser throttling
   - Ensure graceful handling of unexpected interruptions 
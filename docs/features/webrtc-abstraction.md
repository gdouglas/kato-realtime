# WebRTC Abstraction Layer

## Overview

The WebRTC Abstraction Layer provides a clean separation between the core application logic and the WebRTC connection management. This abstraction reduces coupling in the codebase, simplifies the reconnection process, and improves testability of the voice switching functionality.

## Current Implementation

In the current codebase, WebRTC connection management is tightly coupled with application logic in `App.tsx`:

1. Connection creation/management is embedded directly in the component
2. WebRTC event listeners are set up inline
3. Connection state is managed through React state
4. Resource cleanup is handled directly in component methods

This coupling makes it difficult to implement the session reconnection approach without significant changes to the application logic.

## Proposed Abstraction

### 1. WebRTC Connection Manager

A new `WebRTCManager` class will encapsulate the WebRTC connection logic:

```typescript
// src/app/lib/webrtcManager.ts
export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private eventHandlers: {
    onConnectionStatusChange?: (status: SessionStatus) => void;
    onDataChannelMessage?: (data: any) => void;
    onError?: (error: Error) => void;
  } = {};

  /**
   * Create a new WebRTC connection to the Realtime API
   */
  async connect(
    ephemeralKey: string,
    codecPreference: string = "opus"
  ): Promise<void> {
    try {
      if (this.peerConnection) {
        await this.disconnect();
      }

      // Setup audio element if it doesn't exist
      if (!this.audioElement) {
        this.audioElement = document.createElement("audio");
        this.audioElement.autoplay = true;
      }

      // Create and configure connection
      const { pc, dc } = await this.createRealtimeConnection(
        ephemeralKey,
        this.audioElement,
        codecPreference
      );
      
      this.peerConnection = pc;
      this.dataChannel = dc;
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Notify status change
      this.eventHandlers.onConnectionStatusChange?.("CONNECTED");
    } catch (error) {
      this.eventHandlers.onError?.(error as Error);
      this.eventHandlers.onConnectionStatusChange?.("DISCONNECTED");
    }
  }

  /**
   * Cleanly disconnect the WebRTC connection
   */
  async disconnect(): Promise<void> {
    try {
      // Cancel any pending responses
      await this.sendEvent({ type: "output_audio_buffer.clear" });
      
      // Wait for audio processing to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Clean up tracks
      if (this.peerConnection) {
        this.peerConnection.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        
        // Close connection
        this.peerConnection.close();
        this.peerConnection = null;
      }
      
      this.dataChannel = null;
      
      // Notify status change
      this.eventHandlers.onConnectionStatusChange?.("DISCONNECTED");
    } catch (error) {
      this.eventHandlers.onError?.(error as Error);
    }
  }

  /**
   * Send an event through the data channel
   */
  sendEvent(eventData: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.dataChannel || this.dataChannel.readyState !== "open") {
        reject(new Error("Data channel not available or not open"));
        return;
      }
      
      try {
        this.dataChannel.send(JSON.stringify(eventData));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set up event handlers
   */
  setEventHandlers(handlers: {
    onConnectionStatusChange?: (status: SessionStatus) => void;
    onDataChannelMessage?: (data: any) => void;
    onError?: (error: Error) => void;
  }): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Check if the WebRTC connection is active
   */
  isConnected(): boolean {
    return !!(
      this.peerConnection && 
      this.dataChannel && 
      this.dataChannel.readyState === "open"
    );
  }

  /**
   * Set audio playback enabled/disabled
   */
  setAudioEnabled(enabled: boolean): void {
    if (this.audioElement) {
      this.audioElement.autoplay = enabled;
      if (!enabled && !this.audioElement.paused) {
        this.audioElement.pause();
      }
    }
  }

  /**
   * Private method to create the WebRTC connection
   */
  private async createRealtimeConnection(
    ephemeralKey: string,
    audioElement: HTMLAudioElement,
    codecPreference: string
  ): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
    // Reuse existing createRealtimeConnection function
    // This will be refactored from the current lib/realtimeConnection.ts
    // to use the class-based approach
    throw new Error("Not implemented");
  }

  /**
   * Set up WebRTC event listeners
   */
  private setupEventListeners(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.addEventListener("open", () => {
      this.eventHandlers.onConnectionStatusChange?.("CONNECTED");
    });
    
    this.dataChannel.addEventListener("close", () => {
      this.eventHandlers.onConnectionStatusChange?.("DISCONNECTED");
    });
    
    this.dataChannel.addEventListener("error", (err) => {
      this.eventHandlers.onError?.(err as Error);
    });
    
    this.dataChannel.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        this.eventHandlers.onDataChannelMessage?.(data);
      } catch (error) {
        this.eventHandlers.onError?.(error as Error);
      }
    });
  }
}
```

### 2. React Hook for WebRTC Integration

A custom hook to use the WebRTC manager in React components:

```typescript
// src/app/hooks/useWebRTC.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { WebRTCManager } from '@/app/lib/webrtcManager';
import { SessionStatus } from '@/app/types';

export function useWebRTC() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const manager = useRef<WebRTCManager>(new WebRTCManager());
  
  useEffect(() => {
    // Set up event handlers
    manager.current.setEventHandlers({
      onConnectionStatusChange: setSessionStatus,
      onError: (error) => console.error("WebRTC error:", error),
    });
    
    // Cleanup on unmount
    return () => {
      manager.current.disconnect();
    };
  }, []);
  
  const connect = useCallback(async (ephemeralKey: string, codecPreference: string = "opus") => {
    if (sessionStatus === "DISCONNECTED") {
      setSessionStatus("CONNECTING");
      await manager.current.connect(ephemeralKey, codecPreference);
    }
  }, [sessionStatus]);
  
  const disconnect = useCallback(async () => {
    await manager.current.disconnect();
  }, []);
  
  const sendEvent = useCallback(async (eventData: any) => {
    try {
      await manager.current.sendEvent(eventData);
      return true;
    } catch (error) {
      console.error("Failed to send event:", error);
      return false;
    }
  }, []);
  
  const setAudioEnabled = useCallback((enabled: boolean) => {
    manager.current.setAudioEnabled(enabled);
  }, []);
  
  return {
    sessionStatus,
    connect,
    disconnect,
    sendEvent,
    setAudioEnabled,
    isConnected: sessionStatus === "CONNECTED",
  };
}
```

## Integration with App.tsx

The existing App.tsx will be refactored to use the WebRTC abstraction:

```typescript
// In App.tsx
const { 
  sessionStatus, 
  connect: connectToRealtime,
  disconnect: disconnectFromRealtime,
  sendEvent: sendClientEvent,
  setAudioEnabled,
  isConnected 
} = useWebRTC();

// Replace direct WebRTC management with hook usage
useEffect(() => {
  if (selectedAgentName && sessionStatus === "DISCONNECTED") {
    const initializeConnection = async () => {
      const key = await fetchEphemeralKey();
      if (key) {
        await connectToRealtime(key, urlCodec);
      }
    };
    
    initializeConnection();
  }
}, [selectedAgentName, sessionStatus, connectToRealtime, urlCodec]);

// Update audio playback settings when changed
useEffect(() => {
  setAudioEnabled(isAudioPlaybackEnabled);
}, [isAudioPlaybackEnabled, setAudioEnabled]);
```

## Integration with Session Reconnection

The WebRTC abstraction layer will make the session reconnection approach much simpler:

```typescript
async function switchAgent(targetAgent: string, context: any[]): Promise<void> {
  // Get agent configuration
  const agentConfig = selectedAgentConfigSet?.find(a => a.name === targetAgent);
  if (!agentConfig) return;
  
  // 1. Set transition state
  setTransitionState("disconnecting");
  
  // 2. Disconnect current session
  await disconnectFromRealtime();
  
  // 3. Update transition state
  setTransitionState("connecting");
  
  // 4. Connect new session
  const key = await fetchEphemeralKey();
  if (!key) {
    setTransitionState("failed");
    return;
  }
  
  await connectToRealtime(key, urlCodec);
  
  // 5. Send session configuration
  const voice = agentConfig.voice || "sage";
  await sendClientEvent({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: agentConfig.instructions,
      voice,
      input_audio_transcription: { model: "whisper-1" },
      tools: agentConfig.tools,
    }
  });
  
  // 6. Update application state
  setSelectedAgentName(targetAgent);
  setTransitionState("connected");
}
```

## Benefits

1. **Reduced Coupling**: Separation of WebRTC logic from application code
2. **Improved Testability**: WebRTC manager can be mocked for testing
3. **Simplified Reconnection**: Cleaner reconnection process with better error handling
4. **Better Resource Management**: Centralized cleanup of WebRTC resources
5. **Code Readability**: More maintainable codebase with clearer responsibilities

## Testing Strategy

1. **Unit Testing**:
   - Test WebRTCManager class methods in isolation
   - Mock RTCPeerConnection and RTCDataChannel for testing
   - Verify event handler invocation

2. **Integration Testing**:
   - Test useWebRTC hook in a test component
   - Verify state changes during connection lifecycle
   - Test error handling paths

3. **System Testing**:
   - Verify connection and disconnection work end-to-end
   - Test reconnection with the Realtime API
   - Test with different codec options

## Next Steps

1. Refactor existing WebRTC connection code into the abstraction layer
2. Update App.tsx to use the new abstraction
3. Implement and test the session reconnection logic using the abstraction
4. Measure performance impact of the abstraction layer 
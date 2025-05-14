import { useEffect, useRef, useState, useCallback } from "react";
import { WebRTCManager } from "../lib/webrtcManager";
import { SessionStatus } from "../types";

/**
 * React hook for using WebRTC functionality in components
 */
export function useWebRTC() {
  // Create refs to persist between renders
  const managerRef = useRef<WebRTCManager | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  
  // State for session status
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Initialize manager if not already created
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new WebRTCManager();
    }
    
    // Clean up on unmount
    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
        managerRef.current = null;
      }
    };
  }, []);
  
  // Create audio element if needed
  useEffect(() => {
    if (!audioElementRef.current) {
      const audioElement = new Audio();
      audioElement.autoplay = true;
      audioElementRef.current = audioElement;
    }
  }, []);
  
  /**
   * Handle server events from WebRTC
   */
  const handleServerEvent = useCallback((data: any) => {
    // Handle specific event types
    switch (data.type) {
      case "output_audio_buffer.started":
        setIsOutputAudioBufferActive(true);
        break;
        
      case "output_audio_buffer.ended":
      case "output_audio_buffer.cleared":
        setIsOutputAudioBufferActive(false);
        break;
        
      case "session.created":
      case "session.updated":
        console.log(`Session ${data.type.split('.')[1]}`);
        break;
    }
    
    // Forward the event to any custom handlers
    if (onServerEventRef.current) {
      onServerEventRef.current(data);
    }
  }, []);
  
  // Ref for custom server event handler
  const onServerEventRef = useRef<((data: any) => void) | null>(null);
  
  /**
   * Connect to the Realtime API
   */
  const connectToRealtime = useCallback(async (
    ephemeralKey: string,
    onServerEvent?: (data: any) => void
  ): Promise<boolean> => {
    try {
      // Update custom handler ref
      if (onServerEvent) {
        onServerEventRef.current = onServerEvent;
      }
      
      // Ensure we have a manager and audio element
      if (!managerRef.current || !audioElementRef.current) {
        throw new Error("WebRTC manager or audio element not initialized");
      }
      
      // Connect to Realtime API
      const success = await managerRef.current.connect(
        ephemeralKey,
        audioElementRef.current,
        "opus",
        handleServerEvent,
        setSessionStatus,
        setError
      );
      
      return success;
    } catch (error) {
      console.error("Error connecting to Realtime API:", error);
      setSessionStatus("DISCONNECTED");
      setError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }, [handleServerEvent]);
  
  /**
   * Disconnect from the Realtime API
   */
  const disconnectFromRealtime = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
    setSessionStatus("DISCONNECTED");
    setIsOutputAudioBufferActive(false);
  }, []);
  
  /**
   * Send a client event to the Realtime API
   */
  const sendClientEvent = useCallback((eventData: any): boolean => {
    if (!managerRef.current || !managerRef.current.isConnected()) {
      console.error("Cannot send event - not connected");
      return false;
    }
    
    return managerRef.current.sendEvent(eventData);
  }, []);
  
  /**
   * Update the session settings
   */
  const updateSession = useCallback((
    instructions: string,
    voice?: string,
    modalities: string[] = ["text", "audio"]
  ): boolean => {
    if (!managerRef.current || !managerRef.current.isConnected()) {
      console.error("Cannot update session - not connected");
      return false;
    }
    
    return managerRef.current.updateSession(instructions, voice, modalities);
  }, []);
  
  /**
   * Cancel assistant speech
   */
  const cancelAssistantSpeech = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current || !managerRef.current.isConnected()) {
      return false;
    }
    
    const result = managerRef.current.clearAudioBuffer();
    if (result) {
      setIsOutputAudioBufferActive(false);
    }
    
    return result;
  }, []);
  
  /**
   * Create a new message
   */
  const createMessage = useCallback((text: string): boolean => {
    return sendClientEvent({
      type: "conversation.item.create",
      item: {
        role: "user",
        type: "message",
        content: [
          {
            type: "text",
            text
          }
        ]
      }
    });
  }, [sendClientEvent]);
  
  /**
   * Create a new function call
   */
  const createFunctionCall = useCallback((name: string, args: any): boolean => {
    return sendClientEvent({
      type: "conversation.item.create",
      item: {
        role: "user",
        type: "tool_call",
        name,
        arguments: JSON.stringify(args)
      }
    });
  }, [sendClientEvent]);
  
  // Return the API for use in components
  return {
    // State
    sessionStatus,
    isOutputAudioBufferActive,
    error,
    
    // Refs (for direct access if needed)
    audioElementRef,
    
    // Methods
    connectToRealtime,
    disconnectFromRealtime,
    sendClientEvent,
    updateSession,
    cancelAssistantSpeech,
    createMessage,
    createFunctionCall
  };
} 
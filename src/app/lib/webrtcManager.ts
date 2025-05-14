import { SessionStatus } from "../types";

/**
 * WebRTC Manager - encapsulates all WebRTC operations
 * Reduces coupling in App.tsx and centralizes WebRTC logic
 */
export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private status: SessionStatus = "DISCONNECTED";
  private onStatusChange: (status: SessionStatus) => void = () => {};
  private onMessage: (data: any) => void = () => {};
  private onError: (error: Error) => void = () => {};

  /**
   * Initialize the WebRTC Manager
   */
  constructor() {
    // Intentionally empty - we'll initialize on connect
  }

  /**
   * Connect to the OpenAI Realtime API
   */
  public async connect(
    ephemeralKey: string,
    audioElement: HTMLAudioElement,
    audioCodec: string = "opus",
    onMessage?: (data: any) => void,
    onStatusChange?: (status: SessionStatus) => void,
    onError?: (error: Error) => void
  ): Promise<boolean> {
    try {
      // Update callbacks if provided
      if (onMessage) this.onMessage = onMessage;
      if (onStatusChange) this.onStatusChange = onStatusChange;
      if (onError) this.onError = onError;

      // Update status
      this.updateStatus("CONNECTING");
      
      // Store audio element
      this.audioElement = audioElement;

      // Create a new peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });

      // Set up ICE candidate handling
      this.pc.onicecandidate = (event) => {
        if (event.candidate === null) {
          // ICE gathering complete
          console.log("ICE gathering complete");
        }
      };

      // Set up connection state changes
      this.pc.onconnectionstatechange = () => {
        console.log("Connection state:", this.pc?.connectionState);
        if (this.pc?.connectionState === "disconnected" || 
            this.pc?.connectionState === "failed" ||
            this.pc?.connectionState === "closed") {
          this.updateStatus("DISCONNECTED");
        }
      };

      // Create data channel
      this.dc = this.pc.createDataChannel("events", { ordered: true });
      
      // Set up data channel handlers
      this.setupDataChannel();

      // Create WebRTC offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
      });

      // Set local description
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGatheringComplete();

      // Exchange with server
      const connectionResponse = await this.exchangeOfferWithServer(
        ephemeralKey,
        this.pc.localDescription?.sdp || ""
      );

      // Set remote description
      const remoteDesc = new RTCSessionDescription({
        type: "answer",
        sdp: connectionResponse.sdp,
      });
      await this.pc.setRemoteDescription(remoteDesc);

      // Set up audio stream
      this.setupAudioStream(audioCodec);

      return true;
    } catch (error) {
      console.error("Error connecting to Realtime API:", error);
      this.updateStatus("DISCONNECTED");
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Disconnect from the OpenAI Realtime API
   */
  public disconnect(): void {
    try {
      // Clean up resources in reverse order
      
      // 1. Clear any pending audio
      this.clearAudioBuffer();
      
      // 2. Close data channel
      if (this.dc) {
        if (this.dc.readyState === "open") {
          this.dc.close();
        }
        this.dc = null;
      }
      
      // 3. Close peer connection
      if (this.pc) {
        // Stop all tracks
        this.pc.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        
        this.pc.close();
        this.pc = null;
      }
      
      // 4. Update status
      this.updateStatus("DISCONNECTED");
      
      console.log("Disconnected from Realtime API");
    } catch (error) {
      console.error("Error during disconnect:", error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send an event to the OpenAI Realtime API
   */
  public sendEvent(eventData: any): boolean {
    if (!this.dc || this.dc.readyState !== "open") {
      console.error("Cannot send event - data channel not open");
      return false;
    }

    try {
      const eventStr = JSON.stringify(eventData);
      this.dc.send(eventStr);
      return true;
    } catch (error) {
      console.error("Error sending event:", error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Update the session settings
   */
  public updateSession(
    instructions: string,
    voice?: string,
    modalities: string[] = ["text", "audio"]
  ): boolean {
    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities,
        instructions,
        ...(voice ? { voice } : {}),
        input_audio_transcription: { model: "whisper-1" },
      },
    };

    return this.sendEvent(sessionUpdate);
  }

  /**
   * Clear the audio buffer
   */
  public clearAudioBuffer(): boolean {
    if (!this.isConnected()) return false;
    
    return this.sendEvent({ type: "output_audio_buffer.clear" });
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return (
      this.status === "CONNECTED" && 
      this.dc?.readyState === "open" &&
      this.pc?.connectionState === "connected"
    );
  }

  /**
   * Get the current connection status
   */
  public getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Get the data channel
   */
  public getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  /**
   * Get the peer connection
   */
  public getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  // Private helper methods

  /**
   * Update the connection status
   */
  private updateStatus(newStatus: SessionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusChange(newStatus);
    }
  }

  /**
   * Set up the data channel event handlers
   */
  private setupDataChannel(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log("Data channel open");
      this.updateStatus("CONNECTED");
    };

    this.dc.onclose = () => {
      console.log("Data channel closed");
      this.updateStatus("DISCONNECTED");
    };

    this.dc.onerror = (error) => {
      console.error("Data channel error:", error);
      this.handleError(new Error("Data channel error"));
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };
  }

  /**
   * Set up the audio stream
   */
  private setupAudioStream(audioCodec: string): void {
    if (!this.pc || !this.audioElement) return;

    this.pc.ontrack = (event) => {
      const [audioTrack] = event.streams;
      if (this.audioElement && audioTrack) {
        this.audioElement.srcObject = audioTrack;
      }
    };
  }

  /**
   * Wait for ICE gathering to complete
   */
  private waitForIceGatheringComplete(): Promise<void> {
    if (!this.pc) {
      return Promise.reject(new Error("No peer connection"));
    }

    // If already complete, resolve immediately
    if (this.pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    // Wait for completion
    return new Promise((resolve) => {
      const checkState = () => {
        if (!this.pc) {
          resolve();
          return;
        }
        
        if (this.pc.iceGatheringState === "complete") {
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };

      // Set timeout for 5 seconds - consider gathering complete even if state doesn't change
      const timeout = setTimeout(() => {
        console.log("ICE gathering timed out, but continuing...");
        resolve();
      }, 5000);

      // Check state periodically
      checkState();
    });
  }

  /**
   * Exchange offer with server
   */
  private async exchangeOfferWithServer(
    ephemeralKey: string,
    sdp: string
  ): Promise<{ sdp: string }> {
    // Use our own API proxy endpoint to avoid CORS issues
    const response = await fetch("/api/webrtc-exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sdp,
        codec: "opus",
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    this.onError(error);
  }
}

/**
 * Create a WebRTC connection with the OpenAI Realtime API
 * This is a simplified wrapper around the WebRTCManager for backward compatibility
 */
export async function createRealtimeConnection(
  ephemeralKey: string,
  audioElement: HTMLAudioElement,
  audioCodec: string = "opus"
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  const manager = new WebRTCManager();
  
  const success = await manager.connect(ephemeralKey, audioElement, audioCodec);
  
  if (!success) {
    throw new Error("Failed to create Realtime connection");
  }
  
  const pc = manager.getPeerConnection();
  const dc = manager.getDataChannel();
  
  if (!pc || !dc) {
    throw new Error("Failed to create Realtime connection - missing PC or DC");
  }
  
  return { pc, dc };
} 
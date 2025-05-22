import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string,
  enableAudio: boolean
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log(`[RTCSetup] Creating realtime connection... enableAudio=${enableAudio}`);
  // Configure RTCPeerConnection with explicit STUN servers
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[RTCSetup] ICE candidate generated');
    }
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log(`[RTCSetup] ICE connection state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      console.error('[RTCSetup] ICE connection failed or disconnected');
    }
  };
  
  pc.onconnectionstatechange = () => {
    console.log(`[RTCSetup] Connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      console.error('[RTCSetup] Connection failed');
    } else if (pc.connectionState === 'connected') {
      console.log('[RTCSetup] Connection established successfully');
    }
  };

  // Always add explicit audio transceiver for receiving agent audio
  // This is required for the OpenAI API - the offer must contain an audio media section
  console.log('[RTCSetup] Adding audio transceiver for receiving (required for API)');
  if (typeof pc.addTransceiver === 'function') {
    try {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch (e) {
      console.error('[RTCSetup] Error adding recvonly audio transceiver:', e);
    }
  } else {
    console.warn('[RTCSetup] pc.addTransceiver is not a function. Cannot add recvonly audio transceiver explicitly.');
  }
  
  // Log current audio configuration mode
  console.log(`[RTCSetup] Audio configuration mode: ${enableAudio ? 'SPEAK mode with audio' : 'WRITE mode - text only'}`);

  // Store received tracks/streams if the audio element isn't ready
  let pendingAudioStream: MediaStream | null = null;

  pc.ontrack = (e: RTCTrackEvent) => {
    console.log(`[RTCSetup] Track received: ${e.track.kind}`);
    
    if (enableAudio && e.track.kind === 'audio') {
      console.log('[RTCSetup] Audio track received - will process for playback');
      
      // Track state change events for debugging
      e.track.onended = () => console.log(`[RTCSetup] Audio track ended`);
      e.track.onmute = () => console.log(`[RTCSetup] Audio track muted`);
      e.track.onunmute = () => console.log(`[RTCSetup] Audio track unmuted`);
      
      // Save the stream regardless if we have the audio element or not
      if (e.streams && e.streams.length > 0) {
        pendingAudioStream = e.streams[0];
      } else {
        pendingAudioStream = new MediaStream();
        pendingAudioStream.addTrack(e.track);
      }
      
      // Try to attach the stream to the audio element if it exists
      if (audioElement.current) {
        attachStreamToAudioElement(audioElement.current, pendingAudioStream);
      } else {
        console.warn('[RTCSetup] Audio element not available, saving stream for later attachment');
        
        // Set up an interval to check for the audio element and attach when it becomes available
        const checkInterval = setInterval(() => {
          if (audioElement.current && pendingAudioStream) {
            console.log('[RTCSetup] Audio element now available, attaching stream');
            attachStreamToAudioElement(audioElement.current, pendingAudioStream);
            clearInterval(checkInterval);
          }
        }, 500); // Check every 500ms
        
        // Clear the interval after 10 seconds to avoid potential memory leaks
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!audioElement.current) {
            console.error('[RTCSetup] Audio element still not available after 10 seconds');
          }
        }, 10000);
      }
    } else if (e.track.kind === 'audio') { // Audio track received but enableAudio is false
      console.log('[RTCSetup] Audio track received but enableAudio is false (WRITE mode), ignoring for playback');
      // In write mode, we'll still receive the track but won't attach it to the audio element
      // Do NOT stop the track as we may need it later if the user switches to speak mode
    } else if (e.track.kind === 'video') {
      console.log('[RTCSetup] Video track received (ignoring)');
    }
  };

  // Helper function to attach a stream to an audio element
  function attachStreamToAudioElement(element: HTMLAudioElement, stream: MediaStream) {
    try {
      console.log('[RTCSetup] Attaching stream to audio element');
      
      // Ensure the audio element is properly configured
      element.autoplay = enableAudio; // Only autoplay if audio is enabled
      element.muted = !enableAudio; // Mute if audio is disabled
      element.controls = true; // For debugging, can remove in production
      
      // Set the stream as the source
      element.srcObject = stream;
      
      // Listen for audio element events
      element.onloadedmetadata = () => {
        console.log('[RTCSetup] Audio metadata loaded');
        if (enableAudio) {
          element.play()
            .then(() => console.log('[RTCSetup] Audio playback started'))
            .catch(err => console.error('[RTCSetup] Error starting audio playback:', err));
        } else {
          console.log('[RTCSetup] Audio playback disabled (WRITE mode)');
        }
      };
      
      element.onerror = (err) => {
        console.error('[RTCSetup] Audio element error:', err);
      };
    } catch (error) {
      console.error('[RTCSetup] Error setting srcObject:', error);
    }
  }

  if (enableAudio) {
    try {
      console.log('[RTCSetup] Attempting to access microphone for SPEAK mode');
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Add microphone track, which creates a transceiver
      pc.addTrack(ms.getTracks()[0]);
      console.log('[RTCSetup] Microphone track added successfully for SPEAK mode');
    } catch (err: any) {
      console.error('[RTCSetup] getUserMedia failed:', err);
      if (err.name === "NotFoundError") {
        console.warn('[RTCSetup] Microphone not found (NotFoundError), proceeding in listen-only mode for user audio input.');
      } else if (err.name === "NotAllowedError") {
        console.warn('[RTCSetup] Microphone access denied by user (NotAllowedError).');
        throw err; 
      } else {
        console.error('[RTCSetup] Unhandled getUserMedia error, re-throwing.');
        throw err;
      }
    }
  } else {
    console.log('[RTCSetup] Creating silent audio track for WRITE mode (required for API)');
    // Create a silent audio track to make the offer contain an audio section
    // This is needed for the OpenAI API even if we don't actually use audio
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const destination = ctx.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      const silentTrack = destination.stream.getAudioTracks()[0];
      silentTrack.enabled = false; // Make sure it's muted
      pc.addTrack(silentTrack);
      console.log('[RTCSetup] Silent audio track added successfully for WRITE mode');
    } catch (err) {
      console.error('[RTCSetup] Error creating silent audio track:', err);
      // Continue without the track - we still have the audio transceiver
    }
  }

  // Create data channel for events
  const dc = pc.createDataChannel("oai-events");

  dc.onopen = () => {
    console.log('[RTCSetup] Data channel opened');
  };
  dc.onclose = () => {
    console.log('[RTCSetup] Data channel closed');
  };
  dc.onerror = (err) => {
    console.error('[RTCSetup] Data channel error:', err);
  };
  dc.onmessage = (msg) => {
    console.log('[RTCSetup] Data channel message received');
  };

  // Create offer and set local description
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log('[RTCSetup] Local SDP offer created');

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-mini-realtime-preview-2024-12-17";

  try {
    console.log(`[RTCSetup] Sending SDP offer to OpenAI Realtime API`);
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      console.error(`[RTCSetup] SDP fetch failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      throw new Error(`SDP fetch failed: ${sdpResponse.status} ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();
    console.log('[RTCSetup] Received SDP answer from server');
    
    // Check for audio m-line in the remote SDP
    if (answerSdp.includes('m=audio')) {
      console.log('[RTCSetup] Remote SDP contains audio m-line');
    } else {
      console.warn('[RTCSetup] Warning: Remote SDP does not contain audio m-line!');
    }
    
    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: answerSdp,
    };

    await pc.setRemoteDescription(answer);
    console.log('[RTCSetup] Remote description set');
    console.log('[RTCSetup] Connection setup complete');

  } catch (error) {
    console.error("[RTCSetup] Error during SDP exchange:", error);
    // Attempt to close the PC gracefully if it exists
    if (pc && pc.signalingState !== "closed") {
      pc.close();
    }
    throw error; // Re-throw the error to be caught by the caller
  }

  return { pc, dc };
}

// This function is replaced by the more comprehensive updateAudioSettings implementation
// Keeping it for backwards compatibility, but redirecting to updateAudioSettings
export async function setMicrophoneEnabled(
  pc: RTCPeerConnection,
  enabled: boolean
): Promise<void> {
  console.log(`[RTCSetup] setMicrophoneEnabled is deprecated. Use updateAudioSettings instead.`);
  console.log(`[RTCSetup] Redirecting setMicrophoneEnabled(${enabled}) to updateAudioSettings`);
  
  // Find an audio element to pass to updateAudioSettings
  // This isn't ideal, but needed for backwards compatibility
  let audioElement: HTMLAudioElement | null = null;
  
  // Call the more comprehensive function
  return updateAudioSettings(pc, audioElement, enabled);
}

// Utility: Mute or unmute the audio element for speaker control
export function setAudioOutputEnabled(audioElement: HTMLAudioElement | null, enabled: boolean) {
  if (audioElement) {
    audioElement.muted = !enabled;
  }
}

/**
 * Updates audio settings for an existing connection when switching between write and speak modes
 * @param pc The existing RTCPeerConnection
 * @param audioElement The audio element to update
 * @param enableAudio Whether audio should be enabled or disabled
 * @returns Promise that resolves when the update is complete
 */
export async function updateAudioSettings(
  pc: RTCPeerConnection | null,
  audioElement: HTMLAudioElement | null,
  enableAudio: boolean
): Promise<void> {
  if (!pc) {
    console.error('[RTCSetup] Cannot update audio settings: No PeerConnection provided');
    return;
  }

  console.log(`[RTCSetup] Updating audio settings: enableAudio=${enableAudio} (${enableAudio ? 'SPEAK mode' : 'WRITE mode'})`);
  
  // Update audio output settings
  if (audioElement) {
    audioElement.autoplay = enableAudio;
    audioElement.muted = !enableAudio;
    
    // If we're disabling audio, also clear the srcObject to fully stop audio processing
    if (!enableAudio && audioElement.srcObject) {
      const oldSrcObject = audioElement.srcObject;
      audioElement.srcObject = null;
      
      // If the old srcObject was a MediaStream, stop its tracks
      if (oldSrcObject instanceof MediaStream) {
        oldSrcObject.getTracks().forEach(track => {
          track.enabled = false;
          console.log(`[RTCSetup] Disabled track: ${track.kind}`);
        });
      }
      
      console.log(`[RTCSetup] Cleared audio element srcObject for WRITE mode`);
    }
    
    console.log(`[RTCSetup] Audio element updated: autoplay=${audioElement.autoplay}, muted=${audioElement.muted}`);
  }

  try {
    // Get all existing audio senders
    const audioSenders = pc.getSenders().filter(sender => 
      sender.track && sender.track.kind === 'audio'
    );
    
    if (enableAudio) {
      // SPEAK MODE: Enable existing tracks or add new ones if needed
      console.log(`[RTCSetup] Switching to SPEAK mode - ${audioSenders.length} existing audio tracks found`);
      
      // Check if we have any active audio tracks
      const hasActiveTrack = audioSenders.some(sender => 
        sender.track && sender.track.enabled && !sender.track.muted
      );
      
      if (hasActiveTrack) {
        console.log('[RTCSetup] Active audio track already exists for SPEAK mode');
        
        // Ensure all tracks are enabled
        audioSenders.forEach(sender => {
          if (sender.track) {
            sender.track.enabled = true;
            console.log(`[RTCSetup] Ensured track is enabled: ${sender.track.id}`);
          }
        });
      } else {
        // No active tracks or no tracks at all, try to add microphone
        console.log('[RTCSetup] No active audio tracks - attempting to add microphone for SPEAK mode');
        
        try {
          // Get microphone access
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const micTrack = stream.getAudioTracks()[0];
          
          // If we have existing senders, replace their tracks
          if (audioSenders.length > 0) {
            const sender = audioSenders[0];
            await sender.replaceTrack(micTrack);
            console.log('[RTCSetup] Replaced existing track with microphone track');
          } else {
            // Otherwise add a new track
            pc.addTrack(micTrack);
            console.log('[RTCSetup] Added new microphone track');
          }
        } catch (err) {
          console.error('[RTCSetup] Error accessing microphone:', err);
          // Continue even without microphone - we'll be in listen-only mode
        }
      }
    } else {
      // WRITE MODE: Disable all audio tracks
      console.log(`[RTCSetup] Switching to WRITE mode - disabling ${audioSenders.length} audio tracks`);
      
      for (const sender of audioSenders) {
        if (sender.track) {
          // Disable the track but don't stop it - we might need it again
          sender.track.enabled = false;
          console.log(`[RTCSetup] Disabled audio track: ${sender.track.id}`);
        }
      }
      
      // If we have no existing tracks, add a silent disabled track
      if (audioSenders.length === 0) {
        console.log('[RTCSetup] No existing audio tracks - adding silent disabled track for WRITE mode');
        try {
          const ctx = new AudioContext();
          const oscillator = ctx.createOscillator();
          const destination = ctx.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          const silentTrack = destination.stream.getAudioTracks()[0];
          silentTrack.enabled = false; // Make sure it's disabled
          pc.addTrack(silentTrack);
          console.log('[RTCSetup] Added silent disabled track for WRITE mode');
        } catch (err) {
          console.error('[RTCSetup] Error creating silent audio track:', err);
        }
      }
    }
    
    // Update the signaling state if needed - this may not be necessary but helps ensure
    // that the server knows about our audio preferences
    if (pc.signalingState === 'stable') {
      console.log(`[RTCSetup] Audio settings successfully updated for ${enableAudio ? 'SPEAK' : 'WRITE'} mode`);
    } else {
      console.warn(`[RTCSetup] PeerConnection is in non-stable state: ${pc.signalingState}`);
    }
  } catch (error) {
    console.error('[RTCSetup] Error updating audio settings:', error);
    throw error;
  }
}

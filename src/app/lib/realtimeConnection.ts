import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string,
  enableAudio: boolean
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log('[RTCSetup] Creating realtime connection...');
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

  // Add explicit audio transceiver for receiving agent audio
  if (enableAudio) {
    console.log('[RTCSetup] Adding audio transceiver for receiving');
    if (typeof pc.addTransceiver === 'function') {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (e) {
        console.error('[RTCSetup] Error adding recvonly audio transceiver:', e);
      }
    } else {
      console.warn('[RTCSetup] pc.addTransceiver is not a function. Cannot add recvonly audio transceiver explicitly.');
    }
  } else {
    console.log('[RTCSetup] Skipping audio transceiver setup (enableAudio is false)');
  }

  // Store received tracks/streams if the audio element isn't ready
  let pendingAudioStream: MediaStream | null = null;

  pc.ontrack = (e: RTCTrackEvent) => {
    console.log(`[RTCSetup] Track received: ${e.track.kind}`);
    
    if (enableAudio && e.track.kind === 'audio') {
      console.log('[RTCSetup] Audio track received');
      
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
      console.log('[RTCSetup] Audio track received but enableAudio is false, ignoring.');
      e.track.stop(); // Stop the track to release resources if possible
    } else if (e.track.kind === 'video') {
      console.log('[RTCSetup] Video track received (ignoring)');
    }
  };

  // Helper function to attach a stream to an audio element
  function attachStreamToAudioElement(element: HTMLAudioElement, stream: MediaStream) {
    try {
      console.log('[RTCSetup] Attaching stream to audio element');
      
      // Ensure the audio element is properly configured
      element.autoplay = true;
      element.controls = true; // For debugging, can remove in production
      
      // Set the stream as the source
      element.srcObject = stream;
      
      // Listen for audio element events
      element.onloadedmetadata = () => {
        console.log('[RTCSetup] Audio metadata loaded');
        element.play()
          .then(() => console.log('[RTCSetup] Audio playback started'))
          .catch(err => console.error('[RTCSetup] Error starting audio playback:', err));
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
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Add microphone track, which creates a transceiver
      pc.addTrack(ms.getTracks()[0]);
      console.log('[RTCSetup] Microphone track added');
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
    console.log('[RTCSetup] Skipping getUserMedia and addTrack for microphone (enableAudio is false)');
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

// Utility: Replace or remove the microphone track on an active RTCPeerConnection
export async function setMicrophoneEnabled(pc: RTCPeerConnection, enabled: boolean) {
  const audioSender = pc.getSenders().find(sender => sender.track && sender.track.kind === 'audio');
  if (enabled) {
    // Add or replace with a new mic track
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newTrack = stream.getAudioTracks()[0];
      if (audioSender) {
        console.log('[RTCSetup] setMicrophoneEnabled: Replacing track');
        await audioSender.replaceTrack(newTrack);
      } else {
        console.log('[RTCSetup] setMicrophoneEnabled: Adding new track');
        pc.addTrack(newTrack);
      }
      console.log('[RTCSetup] setMicrophoneEnabled: Microphone track active.');
    } catch (err: any) {
      console.error('[RTCSetup] setMicrophoneEnabled: getUserMedia failed:', err);
      if (err.name === "NotFoundError") {
        console.warn('[RTCSetup] setMicrophoneEnabled: Microphone not found (NotFoundError). PTT might not function until a mic is available.');
        // Do not throw. If a track existed and was meant to be replaced, it might remain or be null.
        // If no sender existed, no track is added.
      } else if (err.name === "NotAllowedError") {
        console.warn('[RTCSetup] setMicrophoneEnabled: Microphone access denied by user (NotAllowedError).');
        // Optionally, re-throw or emit an event to inform UI
        throw err; // Or handle by, e.g., forcing PTT off in UI
      } else {
        console.error('[RTCSetup] setMicrophoneEnabled: Unhandled getUserMedia error, re-throwing.');
        throw err;
      }
    }
  } else {
    // Remove or disable the mic track
    console.log('[RTCSetup] setMicrophoneEnabled: Disabling microphone track.');
    if (audioSender) {
      await audioSender.replaceTrack(null); // replaceTrack(null) is the correct way to remove/stop sending
      if (audioSender.track) { // The track itself on the sender might still exist but is stopped by replaceTrack(null)
        // audioSender.track.stop(); // stop() is usually called on the original track if you manage it explicitly
      }
    }
    console.log('[RTCSetup] setMicrophoneEnabled: Microphone track disabled/removed.');
  }
}

// Utility: Mute or unmute the audio element for speaker control
export function setAudioOutputEnabled(audioElement: HTMLAudioElement | null, enabled: boolean) {
  if (audioElement) {
    audioElement.muted = !enabled;
  }
}

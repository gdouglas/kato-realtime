import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log('[RTCSetup] createRealtimeConnection called with audioElement:', audioElement.current);
  // Configure RTCPeerConnection with explicit STUN servers
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (event) => {
    console.log('[RTCSetup] pc.onicecandidate event:', event.candidate ? event.candidate.candidate : '(no candidate)');
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log(`[RTCSetup] pc.oniceconnectionstatechange: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      console.error('[RTCSetup] ICE connection failed or disconnected');
    }
  };
  
  pc.onconnectionstatechange = () => {
    console.log(`[RTCSetup] pc.onconnectionstatechange: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      console.error('[RTCSetup] Connection failed');
    } else if (pc.connectionState === 'connected') {
      console.log('[RTCSetup] Connection established successfully');
    }
  };

  // Add explicit audio transceiver for receiving agent audio
  console.log('[RTCSetup] Adding explicit audio transceiver for receiving');
  if (typeof pc.addTransceiver === 'function') {
    try {
      const audioTransceiver = pc.addTransceiver('audio', { direction: 'recvonly' });
      console.log('[RTCSetup] Audio transceiver added for recvonly:', audioTransceiver);
    } catch (e) {
      console.error('[RTCSetup] Error adding recvonly audio transceiver:', e);
    }
  } else {
    console.warn('[RTCSetup] pc.addTransceiver is not a function. Cannot add recvonly audio transceiver explicitly.');
  }

  // Store received tracks/streams if the audio element isn't ready
  let pendingAudioStream: MediaStream | null = null;

  console.log('[RTCSetup] Assigning pc.ontrack handler.');
  pc.ontrack = (e: RTCTrackEvent) => {
    console.log(`[RTCSetup] pc.ontrack Fired! Track kind: ${e.track.kind}`, e);
    console.log('[RTCSetup] pc.ontrack event details: streams:', e.streams, 'track:', e.track, 'transceiver:', e.transceiver);
    
    // Explicitly handle all track events, even if not audio
    if (e.track.kind === 'audio') {
      console.log('[RTCSetup] Audio track received. audioElement.current:', audioElement.current);
      
      // Log track details
      console.log(`[RTCSetup] Audio track ID: ${e.track.id}, readyState: ${e.track.readyState}, muted: ${e.track.muted}`);
      
      // Track state change events for debugging
      e.track.onended = () => console.log(`[RTCSetup] Audio track ${e.track.id} ended`);
      e.track.onmute = () => console.log(`[RTCSetup] Audio track ${e.track.id} muted`);
      e.track.onunmute = () => console.log(`[RTCSetup] Audio track ${e.track.id} unmuted`);
      
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
        console.warn('[RTCSetup] pc.ontrack: audioElement.current is null, saving stream for later attachment');
        
        // Set up an interval to check for the audio element and attach when it becomes available
        const checkInterval = setInterval(() => {
          if (audioElement.current && pendingAudioStream) {
            console.log('[RTCSetup] Audio element now available, attaching pending stream');
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
    } else if (e.track.kind === 'video') {
      console.log('[RTCSetup] Video track received. Ignoring for now.');
    }
  };

  // Helper function to attach a stream to an audio element
  function attachStreamToAudioElement(element: HTMLAudioElement, stream: MediaStream) {
    try {
      console.log('[RTCSetup] Attempting to set srcObject on audio element');
      
      // Ensure the audio element is properly configured
      element.autoplay = true;
      element.controls = true; // For debugging, can remove in production
      
      // Set the stream as the source
      element.srcObject = stream;
      console.log('[RTCSetup] srcObject set. element.srcObject:', element.srcObject);
      
      // Listen for audio element events
      element.onloadedmetadata = () => {
        console.log('[RTCSetup] Audio loadedmetadata event fired');
        element.play()
          .then(() => console.log('[RTCSetup] Audio playback started successfully'))
          .catch(err => console.error('[RTCSetup] Error starting audio playback:', err));
      };
      
      element.onerror = (err) => {
        console.error('[RTCSetup] Audio element error:', err);
      };
    } catch (error) {
      console.error('[RTCSetup] Error setting srcObject:', error);
    }
  }

  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Add microphone track, which creates a transceiver
    pc.addTrack(ms.getTracks()[0]);
    console.log('[RTCSetup] Microphone track added.');
  } catch (err) {
    console.error('[RTCSetup] getUserMedia failed:', err);
    throw err;
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
    console.log('[RTCSetup] Data channel message received:', msg.data);
  };

  // Create offer and set local description
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log('[RTCSetup] Local SDP Offer:\n', pc.localDescription?.sdp);

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-mini-realtime-preview-2024-12-17";

  try {
    console.log(`[RTCSetup] Sending SDP offer to ${baseUrl}?model=${model}`);
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
      console.error(`[RTCSetup] SDP fetch failed: ${sdpResponse.status} ${sdpResponse.statusText}. Body: ${errorText}`);
      throw new Error(`SDP fetch failed: ${sdpResponse.status} ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();
    console.log('[RTCSetup] Remote SDP Answer:\n', answerSdp);
    
    // Check for audio m-line in the remote SDP
    if (answerSdp.includes('m=audio')) {
      console.log('[RTCSetup] Remote SDP contains audio m-line, proceeding with answer');
    } else {
      console.warn('[RTCSetup] Warning: Remote SDP does not contain audio m-line!');
    }
    
    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: answerSdp,
    };

    await pc.setRemoteDescription(answer);
    console.log('[RTCSetup] Remote description set. Logging transceivers:');
    pc.getTransceivers().forEach(transceiver => {
      console.log(`[RTCSetup] Transceiver MID: ${transceiver.mid}, Direction: ${transceiver.direction}, CurrentDirection: ${transceiver.currentDirection}`);
      if (transceiver.receiver) {
        console.log(`[RTCSetup]   Receiver Track: ${transceiver.receiver.track?.id}, Kind: ${transceiver.receiver.track?.kind}, ReadyState: ${transceiver.receiver.track?.readyState}`);
      } else {
        console.log('[RTCSetup]   Receiver: null');
      }
      if (transceiver.sender) {
        console.log(`[RTCSetup]   Sender Track: ${transceiver.sender.track?.id}, Kind: ${transceiver.sender.track?.kind}`);
      } else {
        console.log('[RTCSetup]   Sender: null');
      }
    });

  } catch (error) {
    console.error("[RTCSetup] Error during SDP exchange or setting remote description:", error);
    // Attempt to close the PC gracefully if it exists
    if (pc && pc.signalingState !== "closed") {
      pc.close();
    }
    throw error; // Re-throw the error to be caught by the caller
  }

  console.log("[RTCSetup] createRealtimeConnection successfully completed. Returning pc and dc.");
  return { pc, dc };
}

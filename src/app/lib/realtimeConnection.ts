import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log("[RTCSetup] Initializing RTCPeerConnection...");
  const pc = new RTCPeerConnection();
  console.log("[RTCSetup] RTCPeerConnection created:", pc);

  pc.onicecandidate = (event) => {
    console.log("[RTCSetup] ICE candidate:", event.candidate);
  };
  pc.oniceconnectionstatechange = () => {
    console.log("[RTCSetup] ICE connection state change:", pc.iceConnectionState);
  };
  pc.onconnectionstatechange = () => {
    console.log("[RTCSetup] Connection state change:", pc.connectionState);
  };

  pc.ontrack = (e) => {
    console.log("[RTCSetup] Ontrack event:", e);
    if (audioElement.current) {
      audioElement.current.srcObject = e.streams[0];
      console.log("[RTCSetup] audioElement.current.srcObject set.");
    } else {
      console.warn("[RTCSetup] audioElement.current is null, cannot set srcObject.");
    }
  };

  console.log("[RTCSetup] Requesting user media (microphone)...");
  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("[RTCSetup] User media obtained:", ms);
    pc.addTrack(ms.getTracks()[0]);
    console.log("[RTCSetup] Audio track added to PC.");
  } catch (err) {
    console.error("[RTCSetup] Error getting user media or adding track:", err);
    throw err; // Re-throw to ensure connection fails if mic access is denied/fails
  }

  // Set codec preferences based on selected codec from the query parameter.
  console.log(`[RTCSetup] Attempting to set codec preferences for: ${codec}`);
  const capabilities = RTCRtpSender.getCapabilities("audio");
  if (capabilities) {
    const chosenCodec = capabilities.codecs.find(
      (c) => c.mimeType.toLowerCase() === `audio/${codec}`
    );
    if (chosenCodec) {
      console.log("[RTCSetup] Found chosen codec:", chosenCodec);
      const transceivers = pc.getTransceivers();
      if (transceivers && transceivers.length > 0 && transceivers[0].sender) {
         // Check if the sender has a track, which indicates it's properly set up.
        if (transceivers[0].sender.track) {
          transceivers[0].setCodecPreferences([chosenCodec]);
          console.log("[RTCSetup] Codec preferences set.");
        } else {
          console.warn("[RTCSetup] Transceiver sender does not have a track. Codec preferences not set. This might happen if addTrack hasn\'t completed or failed silently.");
        }
      } else {
        console.warn("[RTCSetup] No transceivers or sender found. Codec preferences not set.");
      }
    } else {
      console.warn(
        `[RTCSetup] Codec "${codec}" not found in capabilities. Using default settings.`
      );
    }
  } else {
    console.warn("[RTCSetup] Could not get RTP sender capabilities. Using default codec settings.");
  }

  console.log("[RTCSetup] Creating data channel 'oai-events'...");
  const dc = pc.createDataChannel("oai-events");
  console.log("[RTCSetup] Data channel created:", dc);

  dc.onopen = () => console.log("[RTCSetup] DataChannel (created by client): onopen");
  dc.onclose = () => console.log("[RTCSetup] DataChannel (created by client): onclose");
  dc.onerror = (err) => console.error("[RTCSetup] DataChannel (created by client): onerror", err);
  dc.onmessage = (msg) => console.log("[RTCSetup] DataChannel (created by client): onmessage (should not happen)", msg);


  console.log("[RTCSetup] Creating offer...");
  const offer = await pc.createOffer();
  console.log("[RTCSetup] Offer created:", offer);
  console.log("[RTCSetup] Setting local description...");
  await pc.setLocalDescription(offer);
  console.log("[RTCSetup] Local description set.");

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-mini-realtime-preview-2024-12-17"; // Ensure this is the correct model

  console.log(`[RTCSetup] Fetching SDP answer from ${baseUrl}?model=${model}...`);
  try {
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });
    console.log("[RTCSetup] SDP response received, status:", sdpResponse.status);

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      console.error(`[RTCSetup] SDP fetch failed: ${sdpResponse.status} ${sdpResponse.statusText}. Body: ${errorText}`);
      throw new Error(`SDP fetch failed: ${sdpResponse.status} ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();
    console.log("[RTCSetup] SDP answer text obtained:", answerSdp ? answerSdp.substring(0, 100) + "..." : "EMPTY_SDP_ANSWER");
    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: answerSdp,
    };

    console.log("[RTCSetup] Setting remote description...");
    await pc.setRemoteDescription(answer);
    console.log("[RTCSetup] Remote description set.");
  } catch (error) {
    console.error("[RTCSetup] Error during SDP exchange or setting remote description:", error);
    // Attempt to close the PC gracefully if it exists
    if (pc && pc.signalingState !== "closed") {
        console.log("[RTCSetup] Attempting to close PC due to SDP exchange error.");
        pc.close();
    }
    throw error; // Re-throw the error to be caught by the caller
  }

  console.log("[RTCSetup] createRealtimeConnection successfully completed. Returning pc and dc.");
  return { pc, dc };
}

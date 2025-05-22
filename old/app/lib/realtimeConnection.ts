import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = (event) => {};
  pc.oniceconnectionstatechange = () => {};
  pc.onconnectionstatechange = () => {};

  pc.ontrack = (e) => {
    if (audioElement.current) {
      audioElement.current.srcObject = e.streams[0];
    }
  };

  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(ms.getTracks()[0]);
  } catch (err) {
    throw err;
  }

  // Set codec preferences based on selected codec from the query parameter.
  const capabilities = RTCRtpSender.getCapabilities("audio");
  if (capabilities) {
    const chosenCodec = capabilities.codecs.find(
      (c) => c.mimeType.toLowerCase() === `audio/${codec}`
    );
    if (chosenCodec) {
      const transceivers = pc.getTransceivers();
      if (transceivers && transceivers.length > 0 && transceivers[0].sender) {
         // Check if the sender has a track, which indicates it's properly set up.
        if (transceivers[0].sender.track) {
          transceivers[0].setCodecPreferences([chosenCodec]);
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

  const dc = pc.createDataChannel("oai-events");

  dc.onopen = () => {};
  dc.onclose = () => {};
  dc.onerror = (err) => {};
  dc.onmessage = (msg) => {};

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-mini-realtime-preview-2024-12-17";

  try {
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
    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: answerSdp,
    };

    await pc.setRemoteDescription(answer);
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

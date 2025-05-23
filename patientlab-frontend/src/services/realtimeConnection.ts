import type { RefObject } from "react";

// -----------------------------
// OpenAI Realtime configuration
// -----------------------------
const OPENAI_RTC_API = "https://api.openai.com/v1/realtime/sessions";

/**
 * Exchanges an SDP offer for an answer with OpenAI's Realtime API.
 * Replace this with the exact HTTP call specified in your backend docs.
 */
async function sendOfferToOpenAI(ephemeralKey: string, offerSDP: string): Promise<string> {
  const response = await fetch(`${OPENAI_RTC_API}/${ephemeralKey}/offer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ephemeralKey}`,
    },
    body: JSON.stringify({ sdp: offerSDP }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI offer failed – ${response.status}`);
  }

  const { sdp: answer } = (await response.json()) as { sdp: string };
  return answer;
}

/**
 * Creates a full WebRTC data+audio connection to OpenAI's Realtime API.
 *
 * @param ephemeralKey  – token obtained via your fetchEphemeralToken() call
 * @param audioElement  – <audio> element ref for playback
 * @param codec         – e.g. "opus"
 * @param enableAudio   – whether to request / play remote audio
 *
 * @returns { pc, dc }  – the live RTCPeerConnection and DataChannel
 */
export async function createRealtimeConnection(
  ephemeralKey: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string,
  enableAudio: boolean
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log("[RTC] Creating RTCPeerConnection…");

  // 1. PeerConnection baseline config
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  // 2. Optional local media tracks (write‑mode only needs data channel)
  if (enableAudio) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
  }

  // 3. Create a reliable ordered data channel for text exchange
  const dc = pc.createDataChannel("realtime", { ordered: true });

  // 4. Remote audio playback handler
  pc.ontrack = (ev) => {
    if (audioElement.current) {
      const [remoteStream] = ev.streams;
      audioElement.current.srcObject = remoteStream;
      audioElement.current.play().catch(console.error);
    }
  };

  // 5. ICE candidate debugging (optional)
  pc.oniceconnectionstatechange = () =>
    console.log(`[RTC] ICE state → ${pc.iceConnectionState}`);

  // 6. Negotiate SDP
  const offer = await pc.createOffer({ offerToReceiveAudio: enableAudio });
  await pc.setLocalDescription(offer);

  // 6a. Wait for ICE gathering to finish so we have a complete offer
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") resolve();
    };
  });

  console.log("[RTC] Sending offer to OpenAI…");
  const answerSDP = await sendOfferToOpenAI(ephemeralKey, pc.localDescription!.sdp!);

  console.log("[RTC] Received answer – setting remote description…");
  await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

  return { pc, dc };
}

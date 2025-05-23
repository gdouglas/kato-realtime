// src/services/webrtcService.ts
import type { ConnectionEvent } from '@/machines/connectionMachine';
import { fetchEphemeralToken } from '@/api/openaiApi'; // your FastAPI helper

/**
 * Invoked by XState. Sets up a WebRTC connection to the OpenAI Realtime API,
 * emits ICE_CANDIDATE events as they arrive, and emits OPENAI_READY once connected.
 */
export function createWebRTCConnection(apiKey: string) {
  return async (sendBack: (evt: ConnectionEvent) => void) => {
    // 1. Fetch any server‐side session configuration if needed
    const sessionKey = await fetchEphemeralToken();

    // 2. Create the RTCPeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // 3. Open a datachannel (or configure your media tracks here)
    const dc = pc.createDataChannel('openai');

    // 4. Relay local ICE candidates into the machine
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendBack({ type: 'ICE_CANDIDATE', candidate: e.candidate });
      }
    };

    // 5. When connected, notify the machine with both pc & dc
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        sendBack({ type: 'OPENAI_READY', pc, dc });
      }
    };

    // 6. Kick off the SDP offer/answer exchange:
    //    - createOffer, setLocalDescription, send to your backend or directly to OpenAI
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // TODO: send `offer.sdp` + sessionKey to your FastAPI endpoint,
    // receive `answer.sdp`, then:
    // await pc.setRemoteDescription(answer)

    // 7. Return a cleanup callback so XState can tear it down
    return () => {
      dc.close();
      pc.close();
    };
  };
}

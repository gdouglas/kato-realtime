import type { RefObject } from 'react';

// -----------------------------
// OpenAI Realtime HTTP-based SDP negotiation
// -----------------------------
const OPENAI_RTC_API = 'https://api.openai.com/v1/realtime';

/**
 * Creates a full WebRTC data+audio connection to OpenAI's Realtime API.
 * Uses HTTP POST with SDP and supports modalities (audio/text).
 *
 * @param ephemeralKey  – token obtained via your fetchEphemeralToken() call
 * @param audioElement  – <audio> element ref for playback (required if 'audio' modality)
 * @param codec         – e.g. "opus"
 * @param modalities    – array of enabled modalities: 'audio' and/or 'text'
 * @param model         – model name for realtime preview
 *
 * @returns { pc, dc }  – the live RTCPeerConnection and optional DataChannel for text
 */
export async function createRealtimeConnection(
  ephemeralKey: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  codec: string,
  modalities: Array<'audio' | 'text'>,
  model: string = 'gpt-4o-mini-realtime-preview-2024-12-17'
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  console.log('[RTC] Creating RTCPeerConnection…');

  // 1. PeerConnection baseline config
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  const enableAudio = modalities.includes('audio');
  const enableText = modalities.includes('text');
  // 2. Optional local media tracks
  if (enableAudio) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }
  }
  

  // 3. Set up data channel for text and server events
  const dc = pc.createDataChannel('oai-events');
  dc.addEventListener('message', (e) => {
    console.log('[RTC Event]', e.data);
  });

  // 4. Remote audio playback handler
  pc.ontrack = (ev) => {
    if (audioElement.current) {
      const [remoteStream] = ev.streams;
      audioElement.current.srcObject = remoteStream;
      audioElement.current.autoplay = true;
      audioElement.current.play().catch(console.error);
    }
  };

  // 5. ICE state logging
  pc.oniceconnectionstatechange = () =>
    console.log(`[RTC] ICE state → ${pc.iceConnectionState}`);

  // 6. SDP negotiation via HTTP POST
  const offer = await pc.createOffer({ offerToReceiveAudio: enableAudio });
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const listener = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', listener as any);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', listener as any);
  });

  console.log('[RTC] Sending SDP to OpenAI…');
  const response = await fetch(`${OPENAI_RTC_API}?model=${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      'Content-Type': 'application/sdp'
    },
    body: pc.localDescription!.sdp || ''
  });

  if (!response.ok) {
    throw new Error(`SDP negotiation failed (${response.status})`);
  }

  const answerSDP = await response.text();
  console.log('[RTC] Received SDP answer, setting remote description…');
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSDP });

  return { pc, dc };
}

/**
 * Disconnects an active RTCPeerConnection.
 * Cleans up data channels, tracks, and connection state.
 */
export function disconnectRealtimeConnection(pc: RTCPeerConnection, dc?: RTCDataChannel) {
  console.log('[RTC] Disconnecting…');

  try {
    dc?.close();
    pc.getSenders().forEach(sender => sender.track?.stop());
    pc.getReceivers().forEach(receiver => receiver.track?.stop());
    pc.close();
  } catch (err) {
    console.error('[RTC] Error while disconnecting:', err);
  }
}
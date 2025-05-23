import type { RefObject } from 'react';
import { fetchEphemeralToken } from '@/api/openaiApi';
import { createRealtimeConnection } from './realtimeConnection';

/**
 * initializeWebRTC:
 * - Fetches an ephemeral token from your API
 * - Establishes a WebRTC connection to OpenAI using that token
 * - Returns the RTCPeerConnection and RTCDataChannel
 */
export async function initializeWebRTC(
  audioElementRef: RefObject<HTMLAudioElement | null>,
  codec: string,
  modalities: ["audio", "text"],
  model: string = 'gpt-4o-mini-realtime-preview-2024-12-17'
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  try {
    // 1️⃣ Get token
    const { token } = await fetchEphemeralToken();
    if (!token) {
      throw new Error('fetchEphemeralToken did not return a token');
    }

    // 2️⃣ Create the connection
    const { pc, dc } = await createRealtimeConnection(
      token,
      audioElementRef,
      codec,
      modalities,
      model
    );

    console.log('[WebRTC] Connection established');
    return { pc, dc };
  } catch (error: any) {
    console.error('[WebRTC] Initialization failed:', error);
    // Re-throw so callers can handle/display errors
    throw error;
  }
}

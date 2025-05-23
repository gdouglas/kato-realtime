import React, { useRef, useState, useEffect } from 'react';
import { FiCircle, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { initializeWebRTC } from '@/services/webrtcService';
import { disconnectRealtimeConnection } from '@/services/realtimeConnection';

/**
 * SpeakPage: Handles starting and stopping a WebRTC connection to OpenAI,
 * displaying live connection status via react-icons.
 */
export default function SpeakPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [dc, setDc] = useState<RTCDataChannel | null>(null);

  // 'idle' | 'connecting' | 'connected' | 'failed'
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  // Map state to icon
  const StatusIcon = () => {
    switch (connectionState) {
      case 'connecting':
        return <FiCircle className="text-yellow-500 animate-pulse" size={24} />;
      case 'connected':
        return <FiCheckCircle className="text-green-500" size={24} />;
      case 'failed':
        return <FiXCircle className="text-red-500" size={24} />;
      default:
        return <FiCircle className="text-gray-400" size={24} />;
    }
  };

  // Initiate connection
  const handleConnect = async () => {
    setConnectionState('connecting');
    try {
      const { pc: peer, dc: channel } = await initializeWebRTC(audioRef, 'opus', ["audio", "text"]);
      // listen for ICE state changes
      peer.oniceconnectionstatechange = () => {
        const s = peer.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          setConnectionState('connected');
        } else if (s === 'failed' || s === 'disconnected') {
          setConnectionState('failed');
        } else {
          setConnectionState('connecting');
        }
      };
      setPc(peer);
      setDc(channel);
    } catch (err) {
      console.error('Connection failed', err);
      setConnectionState('failed');
    }
  };

  // Disconnect and cleanup
  const handleDisconnect = () => {
    if (pc) {
      disconnectRealtimeConnection(pc, dc || undefined);
      setPc(null);
      setDc(null);
      setConnectionState('idle');
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-4">
      <div className="flex items-center space-x-2">
        <StatusIcon />
        <span className="capitalize font-medium">{connectionState}</span>
      </div>

      {connectionState !== 'connected' ? (
        <Button onClick={handleConnect} className="w-full max-w-xs text-black">
          Connect
        </Button>
      ) : (
        <Button onClick={handleDisconnect} variant="destructive" className="w-full max-w-xs text-black">
          Disconnect
        </Button>
      )}

      <audio ref={audioRef} className="w-full max-w-xs" controls />
    </div>
  );
}

import React, { useRef, useState, useEffect } from 'react';
import { FiCircle, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { initializeWebRTC } from '@/services/webrtcService';
import { disconnectRealtimeConnection } from '@/services/realtimeConnection';

/**
 * MessageList: Displays streaming messages and auto-scrolls to the newest message.
 */
function MessageList({ messages }: { messages: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-xs h-48 overflow-y-auto border p-2 rounded bg-white"
    >
      {messages.length > 0 ? (
        messages.map((msg, idx) => (
          <p key={idx} className="text-sm mb-1">
            {msg}
          </p>
        ))
      ) : (
        <p className="text-gray-500 italic">No messages yet.</p>
      )}
    </div>
  );
}

/**
 * SpeakPage: Handles connecting/disconnecting to OpenAI realtime,
 * streaming text messages, and playing audio.
 */
export default function SpeakPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [dc, setDc] = useState<RTCDataChannel | null>(null);
  const [connectionState, setConnectionState] =
    useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [messages, setMessages] = useState<string[]>([]);

  // Select icon based on connectionState
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

  // Handle incoming data messages
  useEffect(() => {
    if (dc) {
      dc.onmessage = (event) => {
        setMessages((prev) => [...prev, String(event.data)]);
      };
    }
  }, [dc]);

  // Connect button handler
  const handleConnect = async () => {
    setConnectionState('connecting');
    try {
      const { pc: peer, dc: channel } = await initializeWebRTC(
        audioRef,
        'opus',
        ['audio', 'text']
      );
      peer.oniceconnectionstatechange = () => {
        const s = peer.iceConnectionState;
        if (s === 'connected' || s === 'completed') setConnectionState('connected');
        else if (s === 'failed' || s === 'disconnected') setConnectionState('failed');
        else setConnectionState('connecting');
      };
      setPc(peer);
      if (channel) setDc(channel);
    } catch (err) {
      console.error('Connection failed', err);
      setConnectionState('failed');
    }
  };

  // Disconnect handler
  const handleDisconnect = () => {
    if (pc) {
      disconnectRealtimeConnection(pc, dc || undefined);
      setPc(null);
      setDc(null);
      setConnectionState('idle');
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-4">
      {/* Connection status */}
      <div className="flex items-center space-x-2">
        <StatusIcon />
        <span className="capitalize font-medium">{connectionState}</span>
      </div>

      {/* Connect / Disconnect buttons */}
      {connectionState !== 'connected' ? (
        <Button onClick={handleConnect} className="w-full max-w-xs">
          Connect
        </Button>
      ) : (
        <Button onClick={handleDisconnect} variant="destructive" className="w-full max-w-xs">
          Disconnect
        </Button>
      )}

      {/* Audio playback element */}
      <audio ref={audioRef} className="w-full max-w-xs" controls />

      {/* Streaming messages display */}
      <MessageList messages={messages} />
    </div>
  );
}

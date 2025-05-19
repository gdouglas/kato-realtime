"use-client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem, AgentConfig } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { DownloadIcon, ClipboardCopyIcon } from "@radix-ui/react-icons";
import { GuardrailChip } from "./GuardrailChip";

export interface TranscriptProps {
  onSendText: (text: string) => Promise<void>;
  onSendAudio: (audioBlob: Blob, durationMillis: number) => void;
  currentUserInput: string;
  setCurrentUserInput: React.Dispatch<React.SetStateAction<string>>;
  currentAgentName?: string;
  isAgentLoading: boolean;
  isSwitchingAgent: boolean;
  isFunctionCallInProgress: boolean;
  userResponseSuggestions: string[];
  audioInputMode: string;
  micAccessError: boolean;
  onMicAccessError: () => void;
  onMicAccessRecovered: () => void;
  micDisabled?: boolean;
}

function Transcript({
  onSendText,
  onSendAudio,
  currentUserInput,
  setCurrentUserInput,
  currentAgentName,
  isAgentLoading,
  isSwitchingAgent,
  isFunctionCallInProgress,
  userResponseSuggestions,
  audioInputMode,
  micAccessError,
  onMicAccessError,
  onMicAccessRecovered,
  micDisabled,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  console.log("[Transcript.tsx] Received transcriptItems:", JSON.stringify(transcriptItems, null, 2));
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [prevLogs, setPrevLogs] = useState<TranscriptItem[]>([]);
  const [justCopied, setJustCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function scrollToBottom() {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    const hasNewMessage = transcriptItems.length > prevLogs.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
        (newItem.title !== oldItem.title || newItem.data !== oldItem.data)
      );
    });

    if (hasNewMessage || hasUpdatedMessage) {
      scrollToBottom();
    }

    setPrevLogs(transcriptItems);
  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    const canActuallySend = !isAgentLoading && !isSwitchingAgent && !isFunctionCallInProgress;
    if (canActuallySend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAgentLoading, isSwitchingAgent, isFunctionCallInProgress]);

  const handleCopyTranscript = async () => {
    if (!transcriptRef.current) return;
    try {
      await navigator.clipboard.writeText(transcriptRef.current.innerText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  };

  const handleDownloadTranscript = () => {
    const simplifiedAgentName = currentAgentName ? currentAgentName.replace(/\s+/g, '_').toLowerCase() : 'agent';
    const date = new Date();
    const dateString = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const timeString = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
    const filename = `transcript_${simplifiedAgentName}_${dateString}_${timeString}.txt`;

    let transcriptText = `Transcript with: ${currentAgentName || 'N/A'}\n`;
    transcriptText += `Date: ${date.toLocaleString()}\n\n`;

    transcriptItems.forEach(item => {
      if (item.type === "MESSAGE") {
        const currentRole = item.role || "unknown";
        const roleDisplay = currentRole === 'user' ? 'User' : currentRole === 'assistant' ? (currentAgentName || 'Assistant') : currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        const displayTimestamp = item.timestamp || new Date(item.createdAtMs).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const title = item.title?.startsWith("[") && item.title?.endsWith("]") ? item.title.slice(1, -1) : item.title;
        transcriptText += `[${displayTimestamp}] ${roleDisplay}: ${title}\n`;
      } else if (item.type === "BREADCRUMB") {
        const displayTimestamp = item.timestamp || new Date(item.createdAtMs).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        transcriptText += `[${displayTimestamp}] --- ${item.title} --- \n`;
        if (item.data) {
          transcriptText += `    Data: ${JSON.stringify(item.data)}\n`;
        }
      }
    });

    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSend = () => {
    if (currentUserInput.trim()) {
      onSendText(currentUserInput.trim());
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-gray-900 min-h-0 rounded-xl shadow-md">
      <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10 text-base border-b bg-gray-50 dark:bg-gray-800 rounded-t-xl">
        <div className="flex items-center gap-x-3">
          <span className="font-semibold text-gray-800 dark:text-white">Transcript ({currentAgentName || 'N/A'})</span>
        </div>
        <div className="flex gap-x-2">
          <button
            onClick={handleCopyTranscript}
            className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-x-1"
            title="Copy transcript to clipboard"
          >
            <ClipboardCopyIcon />
            {justCopied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={handleDownloadTranscript}
            className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-x-1"
            title="Download transcript as a text file"
          >
            <DownloadIcon />
            Download
          </button>
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={transcriptRef}
        className="overflow-y-auto p-4 flex flex-col gap-y-3 flex-1"
      >
        {transcriptItems.map((item) => {
          const {
            itemId,
            type,
            role,
            data,
            expanded,
            timestamp,
            title = "",
            isHidden,
            guardrailResult,
          } = item;

          if (isHidden) {
            return null;
          }

          if (type === "MESSAGE") {
            const isUser = role === "user";
            const bubbleBase = `max-w-xl p-3 rounded-lg shadow`;
            const messageAlignment = isUser ? "ml-auto bg-blue-500 text-white" : "mr-auto bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100";
            
            const isBracketedMessage = title.startsWith("[") && title.endsWith("]");
            const messageStyle = isBracketedMessage ? "italic text-gray-500 dark:text-gray-400" : "";
            const displayTitle = isBracketedMessage ? title.slice(1, -1) : title;

            return (
              <div key={itemId} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                <div className={`${bubbleBase} ${messageAlignment}`}>
                  <div className={`text-xs mb-1 ${isUser ? "text-blue-200" : "text-gray-500 dark:text-gray-400"} font-mono`}>
                    {role} @ {timestamp}
                  </div>
                  <div className={`whitespace-pre-wrap ${messageStyle}`}>
                    <ReactMarkdown>{displayTitle}</ReactMarkdown>
                  </div>
                </div>
                {guardrailResult && (
                  <div className={`mt-1 max-w-xl w-full ${isUser ? "ml-auto" : "mr-auto"}`}>
                    <GuardrailChip guardrailResult={guardrailResult} />
                  </div>
                )}
              </div>
            );
          } else if (type === "BREADCRUMB") {
            return (
              <div
                key={itemId}
                className="my-1 py-1 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-750 rounded-md flex items-center gap-2 w-full"
              >
                <span className="font-mono">{timestamp}</span>
                <div
                  className={`whitespace-pre-wrap flex items-center font-medium text-gray-700 dark:text-gray-300 ${
                    data ? "cursor-pointer" : ""
                  }`}
                  onClick={() => data && toggleTranscriptItemExpand(itemId)}
                >
                  {data && (
                    <span
                      className={`text-gray-400 dark:text-gray-500 mr-1.5 transform transition-transform duration-200 select-none font-mono ${
                        expanded ? "rotate-90" : "rotate-0"
                      }`}
                    >
                      ▶
                    </span>
                  )}
                  {title}
                </div>
                {expanded && data && (
                  <div className="w-full pl-4 mt-1">
                    <pre className="border-l-2 border-gray-300 dark:border-gray-600 whitespace-pre-wrap break-words font-mono text-xs p-2 bg-white dark:bg-gray-800 rounded shadow">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          } else {
            return (
              <div
                key={itemId}
                className="flex justify-center text-gray-500 dark:text-gray-400 text-sm italic font-mono py-1"
              >
                Unknown item type: {type}{" "}
                <span className="ml-2 text-xs">{timestamp}</span>
              </div>
            );
          }
        })}
      </div>

      {/* Input Area - Adapted to new props */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        { userResponseSuggestions && userResponseSuggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {userResponseSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onSendText(suggestion)}
                className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 dark:bg-blue-700 dark:text-blue-100 dark:hover:bg-blue-600"
                disabled={isAgentLoading || isSwitchingAgent || isFunctionCallInProgress || micDisabled}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-x-2">
          <input
            ref={inputRef}
            type="text"
            value={currentUserInput}
            onChange={(e) => setCurrentUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              micDisabled 
                ? "Type message..."
                : micAccessError 
                  ? "Microphone access denied" 
                  : audioInputMode === "push_to_talk" 
                    ? "Type message or hold space to talk" 
                    : "Type message or speak"
            }
            className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            disabled={isAgentLoading || isSwitchingAgent || isFunctionCallInProgress || micAccessError || micDisabled}
          />
          <button
            onClick={handleSend}
            disabled={isAgentLoading || isSwitchingAgent || isFunctionCallInProgress || !currentUserInput.trim() || micAccessError || micDisabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Send
          </button>
        </div>
        {(micAccessError && !micDisabled) && <p className="text-red-500 text-xs mt-1">Microphone access is denied. Please check your browser settings.</p>}
      </div>
    </div>
  );
}

export default Transcript;

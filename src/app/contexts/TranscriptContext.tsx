"use client";

import React, { createContext, useContext, useState, FC, PropsWithChildren, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { TranscriptItem } from "@/app/types";
import { useEventBus } from "./EventBusContext"; // Assuming this path is correct
import { KatoEvents } from "@/app/cases/kato/KatoEvents";
import {
  ServerSessionCreatedPayload,
  ServerTranscriptItemCreatedPayload,
  ServerUserTranscriptCompletedPayload,
  ServerAssistantDeltaReceivedPayload,
  ServerAssistantMessageCompletedPayload,
  ServerTranscriptItemStatusUpdatePayload,
  ServerUserTranscriptDeltaPayload
} from "@/app/cases/kato/KatoEventPayloads";

// Payloads for events (mirroring what machine emits)
// Remove individual interface definitions if they are now imported from KatoEventPayloads.ts
// For example, remove:
// interface ServerSessionCreatedPayload { sessionId: string; }
// ... and so on for other payload types already defined in KatoEventPayloads.ts

type TranscriptContextValue = {
  transcriptItems: TranscriptItem[];
  addTranscriptMessage: (itemId: string, role: "user" | "assistant" | "system", text: string, hidden?: boolean) => void;
  updateTranscriptMessage: (itemId: string, text: string, isDelta: boolean) => void;
  addTranscriptBreadcrumb: (title: string, data?: Record<string, any>) => void;
  toggleTranscriptItemExpand: (itemId: string) => void;
  updateTranscriptItem: (itemId: string, updatedProperties: Partial<TranscriptItem>) => void;
  clearTranscriptItems: () => void;
};

const TranscriptContext = createContext<TranscriptContextValue | undefined>(undefined);

export const TranscriptProvider: FC<PropsWithChildren> = ({ children }) => {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const eventBus = useEventBus();

  function newTimestampPretty(): string {
    return new Date().toLocaleTimeString([], {
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const clearTranscriptItems = useCallback(() => {
    setTranscriptItems([]);
  }, [setTranscriptItems]);

  // Still expose addTranscriptMessage for user-initiated messages or direct local additions
  const addTranscriptMessage: TranscriptContextValue["addTranscriptMessage"] = useCallback((itemId, role, text = "", isHidden = false) => {
    setTranscriptItems((prev) => {
      if (prev.some((log) => log.itemId === itemId && log.type === "MESSAGE")) {
        // If called directly and item exists, perhaps update it instead of warning, or ensure callers handle this.
        // For now, matches original behavior.
        console.warn(`[TranscriptContext] addTranscriptMessage called for existing itemId=${itemId}.`);
        return prev.map(item => item.itemId === itemId ? { ...item, title: text, role, isHidden, status: "DONE" } : item);
      }
      const newItem: TranscriptItem = {
        itemId,
        type: "MESSAGE",
        role,
        title: text,
        expanded: false,
        timestamp: newTimestampPretty(),
        createdAtMs: Date.now(),
        status: role === 'user' ? "DONE" : "IN_PROGRESS", // User messages are done, assistant might be in progress
        isHidden,
      };
      return [...prev, newItem];
    });
  }, [setTranscriptItems]);

  // updateTranscriptMessage: Primarily for local/direct updates if needed. Deltas/completions handled by events.
  const updateTranscriptMessage: TranscriptContextValue["updateTranscriptMessage"] = useCallback((itemId, newText, append = false) => {
    setTranscriptItems((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId && item.type === "MESSAGE") {
          return {
            ...item,
            title: append ? (item.title ?? "") + newText : newText,
            // Optionally update status here if this call implies completion
            // status: "DONE" 
          };
        }
        return item;
      })
    );
  }, [setTranscriptItems]);

  const addTranscriptBreadcrumb: TranscriptContextValue["addTranscriptBreadcrumb"] = useCallback((title, data) => {
    setTranscriptItems((prev) => [
      ...prev,
      {
        itemId: `breadcrumb-${uuidv4()}`,
        type: "BREADCRUMB",
        title,
        data,
        expanded: false,
        timestamp: newTimestampPretty(),
        createdAtMs: Date.now(),
        status: "DONE",
        isHidden: false,
      },
    ]);
  }, [setTranscriptItems]);

  const toggleTranscriptItemExpand: TranscriptContextValue["toggleTranscriptItemExpand"] = useCallback((itemId) => {
    setTranscriptItems((prev) =>
      prev.map((log) =>
        log.itemId === itemId ? { ...log, expanded: !log.expanded } : log
      )
    );
  }, [setTranscriptItems]);

  const updateTranscriptItem: TranscriptContextValue["updateTranscriptItem"] = useCallback((itemId, updatedProperties) => {
    setTranscriptItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, ...updatedProperties } : item
      )
    );
  }, [setTranscriptItems]);

  const USER_PROCESSING_PLACEHOLDER = "[Processing...]"; // Define placeholder

  useEffect(() => {
    const handleServerSessionCreated = (data: ServerSessionCreatedPayload) => {
      console.log("[TranscriptContext] Event: SERVER_SESSION_CREATED", data);
      clearTranscriptItems();
      // Optionally add a breadcrumb for the new session
      addTranscriptBreadcrumb(`New session started: ${data.sessionId}`);
    };

    const handleServerTranscriptItemCreated = (data: ServerTranscriptItemCreatedPayload) => {
      console.log("[TranscriptContext] Event: SERVER_TRANSCRIPT_ITEM_CREATED", data);
      setTranscriptItems((prev) => {
        if (prev.some((item) => item.itemId === data.itemId)) {
          // If item exists, update it. This might happen if creation and update events are close.
          return prev.map((item) =>
            item.itemId === data.itemId
              ? { ...item, role: data.role, title: data.text, status: data.role === 'user' ? "DONE" : "IN_PROGRESS", isHidden: !!data.isHidden }
              : item
          );
        }
        const newItem: TranscriptItem = {
          itemId: data.itemId,
          type: "MESSAGE",
          role: data.role,
          title: data.text,
          expanded: false,
          timestamp: newTimestampPretty(),
          createdAtMs: Date.now(),
          status: data.role === 'user' ? "DONE" : "IN_PROGRESS", // Initial status
          isHidden: !!data.isHidden,
        };
        return [...prev, newItem];
      });
    };

    const handleServerUserTranscriptCompleted = (data: ServerUserTranscriptCompletedPayload) => {
      console.log("[TranscriptContext] Event: SERVER_USER_TRANSCRIPT_COMPLETED", data);
      setTranscriptItems((prev) =>
        prev.map((item) =>
          item.itemId === data.itemId && item.type === "MESSAGE" && item.role === "user"
            ? { ...item, title: data.transcript, status: "DONE" }
            : item
        )
      );
    };

    const handleServerUserTranscriptDelta = (data: ServerUserTranscriptDeltaPayload) => {
      // console.log("[TranscriptContext] Event: SERVER_USER_TRANSCRIPT_DELTA", data); // Can be noisy
      setTranscriptItems((prev) =>
        prev.map((item) => {
          if (item.itemId === data.itemId && item.type === "MESSAGE" && item.role === "user") {
            return {
              ...item,
              title: item.title === USER_PROCESSING_PLACEHOLDER ? data.deltaText : (item.title ?? "") + data.deltaText,
              status: "IN_PROGRESS",
            };
          }
          return item;
        })
      );
    };

    const handleServerAssistantDeltaReceived = (data: ServerAssistantDeltaReceivedPayload) => {
      // console.log("[TranscriptContext] Event: SERVER_ASSISTANT_DELTA_RECEIVED", data); // Can be too noisy
      setTranscriptItems((prev) =>
        prev.map((item) => {
          if (item.itemId === data.itemId && item.type === "MESSAGE" && item.role === "assistant") {
            return {
              ...item,
              title: (item.title ?? "") + data.deltaText,
              status: "IN_PROGRESS",
            };
          }
          return item;
        })
      );
    };

    const handleServerAssistantMessageCompleted = (data: ServerAssistantMessageCompletedPayload) => {
      console.log("[TranscriptContext] Event: SERVER_ASSISTANT_MESSAGE_COMPLETED", data);
      setTranscriptItems((prev) =>
        prev.map((item) =>
          item.itemId === data.itemId && item.type === "MESSAGE" && item.role === "assistant"
            ? { ...item, title: data.fullText, status: "DONE" }
            : item
        )
      );
    };

    const handleServerTranscriptItemStatusUpdate = (data: ServerTranscriptItemStatusUpdatePayload) => {
      console.log("[TranscriptContext] Event: SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE received data:", JSON.stringify(data));
      setTranscriptItems((prev) => {
        console.log(`[TranscriptContext] SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE: prevItems count: ${prev.length}`);
        const newItems = prev.map((item) => {
          if (item.itemId === data.itemId) {
            const newTitle = data.finalText !== undefined ? data.finalText : item.title;
            console.log(`[TranscriptContext] SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE: Matched itemId ${data.itemId}. Old title: '${item.title}', New title: '${newTitle}', Status: '${data.status}'`);
            return { ...item, status: data.status as TranscriptItem['status'], title: newTitle };
          }
          return item;
        });
        // console.log(`[TranscriptContext] SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE: newItems:`, JSON.stringify(newItems.find(i => i.itemId === data.itemId)));
        return newItems;
      });
    };

    eventBus.on(KatoEvents.SERVER_SESSION_CREATED, handleServerSessionCreated);
    eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, handleServerTranscriptItemCreated);
    eventBus.on(KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED, handleServerUserTranscriptCompleted);
    eventBus.on(KatoEvents.SERVER_USER_TRANSCRIPT_DELTA, handleServerUserTranscriptDelta);
    eventBus.on(KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED, handleServerAssistantDeltaReceived);
    eventBus.on(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, handleServerAssistantMessageCompleted);
    eventBus.on(KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE, handleServerTranscriptItemStatusUpdate);

    return () => {
      eventBus.off(KatoEvents.SERVER_SESSION_CREATED, handleServerSessionCreated);
      eventBus.off(KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED, handleServerTranscriptItemCreated);
      eventBus.off(KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED, handleServerUserTranscriptCompleted);
      eventBus.off(KatoEvents.SERVER_USER_TRANSCRIPT_DELTA, handleServerUserTranscriptDelta);
      eventBus.off(KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED, handleServerAssistantDeltaReceived);
      eventBus.off(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, handleServerAssistantMessageCompleted);
      eventBus.off(KatoEvents.SERVER_TRANSCRIPT_ITEM_STATUS_UPDATE, handleServerTranscriptItemStatusUpdate);
    };
  }, [eventBus, clearTranscriptItems, addTranscriptBreadcrumb, setTranscriptItems]); // Added setTranscriptItems to deps for safety, though handlers use prev state

  const contextValue = React.useMemo(() => ({
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItem,
    clearTranscriptItems,
  }), [
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItem,
    clearTranscriptItems,
  ]);

  return (
    <TranscriptContext.Provider
      value={contextValue}
    >
      {children}
    </TranscriptContext.Provider>
  );
};

export function useTranscript() {
  const context = useContext(TranscriptContext);
  if (!context) {
    throw new Error("useTranscript must be used within a TranscriptProvider");
  }
  return context;
}
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

// Add global type declaration at the top of the file
declare global {
  interface Window {
    __TRANSCRIPT_ITEMS__?: any[]; // Use any[] to match the definition in katoAgentLifecycleMachine.ts
    __AGENT_CONVERSATION_CONTEXTS__?: Record<string, TranscriptItem[]>; // Add map to store per-agent contexts
  }
}

type TranscriptContextValue = {
  transcriptItems: TranscriptItem[];
  addTranscriptMessage: (itemId: string, role: "user" | "assistant" | "system", text: string, hidden?: boolean, agentName?: string) => void;
  updateTranscriptMessage: (itemId: string, text: string, isDelta: boolean) => void;
  addTranscriptBreadcrumb: (title: string, data?: Record<string, any>) => void;
  toggleTranscriptItemExpand: (itemId: string) => void;
  updateTranscriptItem: (itemId: string, updatedProperties: Partial<TranscriptItem>) => void;
  clearTranscriptItems: () => void;
  agentConversationContexts: Record<string, TranscriptItem[]>;
};

const TranscriptContext = createContext<TranscriptContextValue | undefined>(undefined);

export const TranscriptProvider: FC<PropsWithChildren> = ({ children }) => {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [agentConversationContexts, setAgentConversationContexts] = useState<Record<string, TranscriptItem[]>>({});
  const eventBus = useEventBus();

  // Make transcript items available globally for agent switching
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__TRANSCRIPT_ITEMS__ = transcriptItems;
      window.__AGENT_CONVERSATION_CONTEXTS__ = agentConversationContexts;
    }
  }, [transcriptItems, agentConversationContexts]);

  function newTimestampPretty(): string {
    return new Date().toLocaleTimeString([], {
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const clearTranscriptItems = useCallback(() => {
    console.log("[TranscriptContext] Clearing all transcript items");
    setTranscriptItems([]);
  }, [setTranscriptItems]);

  // Update the agent conversation context when a transcript item is added/updated
  const updateAgentContext = useCallback((item: TranscriptItem) => {
    if (!item.agentName || item.type !== 'MESSAGE') return;
    
    setAgentConversationContexts(prev => {
      const agentName = item.agentName as string;
      const existingContext = prev[agentName] || [];
      
      // Check if the item already exists in this agent's context
      const itemExists = existingContext.some(i => i.itemId === item.itemId);
      
      if (itemExists) {
        // Update the existing item
        const updatedContext = existingContext.map(i => 
          i.itemId === item.itemId ? item : i
        );
        console.log(`[TranscriptContext] Updated item in ${agentName}'s context: ${item.itemId} (${item.role})`);
        return { ...prev, [agentName]: updatedContext };
      } else {
        // Add the new item
        const updatedContext = [...existingContext, item];
        console.log(`[TranscriptContext] Added item to ${agentName}'s context: ${item.itemId} (${item.role})`);
        return { ...prev, [agentName]: updatedContext };
      }
    });
  }, []);

  // Still expose addTranscriptMessage for user-initiated messages or direct local additions
  const addTranscriptMessage: TranscriptContextValue["addTranscriptMessage"] = useCallback((itemId, role, text = "", isHidden = false, agentName) => {
    console.log(`[TranscriptContext] Adding transcript message: ${itemId}, role: ${role}, agent: ${agentName || 'unknown'}`);
    
    setTranscriptItems((prev) => {
      if (prev.some((log) => log.itemId === itemId && log.type === "MESSAGE")) {
        // If called directly and item exists, perhaps update it instead of warning, or ensure callers handle this.
        // For now, matches original behavior.
        console.warn(`[TranscriptContext] addTranscriptMessage called for existing itemId=${itemId}.`);
        return prev.map(item => item.itemId === itemId ? { ...item, title: text, role, isHidden, status: "DONE", agentName } : item);
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
        agentName,
      };
      
      // Also update the agent-specific context
      if (agentName) {
        updateAgentContext(newItem);
      }
      
      return [...prev, newItem];
    });
  }, [setTranscriptItems, updateAgentContext]);

  // updateTranscriptMessage: Primarily for local/direct updates if needed. Deltas/completions handled by events.
  const updateTranscriptMessage: TranscriptContextValue["updateTranscriptMessage"] = useCallback((itemId, newText, append = false) => {
    console.log(`[TranscriptContext] Updating transcript message: ${itemId}, append: ${append}`);
    
    setTranscriptItems((prev) => {
      const updatedItems = prev.map((item) => {
        if (item.itemId === itemId && item.type === "MESSAGE") {
          const updatedItem = {
            ...item,
            title: append ? (item.title ?? "") + newText : newText,
            // Optionally update status here if this call implies completion
            // status: "DONE" 
          };
          
          // Also update the agent-specific context
          if (item.agentName) {
            updateAgentContext(updatedItem);
          }
          
          return updatedItem;
        }
        return item;
      });
      
      return updatedItems;
    });
  }, [setTranscriptItems, updateAgentContext]);

  const addTranscriptBreadcrumb: TranscriptContextValue["addTranscriptBreadcrumb"] = useCallback((title, data) => {
    console.log(`[TranscriptContext] Adding breadcrumb: ${title}`);
    
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
    console.log(`[TranscriptContext] Updating transcript item: ${itemId}`, updatedProperties);
    
    setTranscriptItems((prev) => {
      const item = prev.find(i => i.itemId === itemId);
      const updatedItems = prev.map((item) => {
        if (item.itemId === itemId) {
          const updatedItem = { ...item, ...updatedProperties };
          
          // Also update the agent-specific context
          if (item.agentName && updatedItem.type === 'MESSAGE') {
            updateAgentContext(updatedItem);
          }
          
          return updatedItem;
        }
        return item;
      });
      
      return updatedItems;
    });
  }, [setTranscriptItems, updateAgentContext]);

  // Listen for agent change events to log context switching
  useEffect(() => {
    const handleAgentChanged = (data: { newAgentName?: string; oldAgentName?: string }) => {
      if (data.newAgentName && data.oldAgentName && data.newAgentName !== data.oldAgentName) {
        console.log(`[TranscriptContext] Agent changed from ${data.oldAgentName} to ${data.newAgentName}`);
        
        // Log the context sizes for debugging
        const oldAgentContextSize = agentConversationContexts[data.oldAgentName]?.length || 0;
        const newAgentContextSize = agentConversationContexts[data.newAgentName]?.length || 0;
        console.log(`[TranscriptContext] Context sizes - Previous agent: ${oldAgentContextSize}, New agent: ${newAgentContextSize}`);
      }
    };
    
    const unsubscribe = eventBus.on(KatoEvents.CURRENT_AGENT_CHANGED, handleAgentChanged);
    return () => unsubscribe();
  }, [eventBus, agentConversationContexts]);

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
        // First check if item already exists, update it if so
        if (prev.some((item) => item.itemId === data.itemId)) {
          // If item exists, update it. This might happen if creation and update events are close.
          const updatedItems = prev.map((item) => {
            if (item.itemId === data.itemId) {
              const updatedItem: TranscriptItem = { 
                ...item, 
                role: data.role, 
                title: data.text, 
                status: data.role === 'user' ? "DONE" : "IN_PROGRESS" as const, 
                isHidden: !!data.isHidden,
                agentName: data.agentName // Always use the received agent name
              };
              
              // Also update the agent-specific context
              if (data.agentName) {
                updateAgentContext(updatedItem);
              }
              
              return updatedItem;
            }
            return item;
          });
          
          return updatedItems;
        }

        // Create the new item
        const newItem: TranscriptItem = {
          itemId: data.itemId,
          type: "MESSAGE",
          role: data.role,
          title: data.text,
          expanded: false,
          timestamp: newTimestampPretty(),
          createdAtMs: Date.now(),
          status: data.role === 'user' ? "DONE" : "IN_PROGRESS", 
          isHidden: !!data.isHidden,
          agentName: data.agentName
        };
        
        // Also update the agent-specific context
        if (data.agentName) {
          updateAgentContext(newItem);
        }

        // If there's no previousItemId, just append the item
        if (!data.previousItemId) {
          console.log(`[TranscriptContext] Adding new message (${data.role}) with no previousItemId, agent: ${data.agentName || 'unknown'}`);
          return [...prev, newItem];
        }

        // Handle insertion based on previousItemId
        const previousItemIndex = prev.findIndex(item => item.itemId === data.previousItemId);
        
        // If previous item not found, just append (shouldn't happen but graceful fallback)
        if (previousItemIndex === -1) {
          console.warn(`[TranscriptContext] Previous item ${data.previousItemId} not found for item ${data.itemId}`);
          return [...prev, newItem];
        }

        // Insert the new item after the previous item
        console.log(`[TranscriptContext] Inserting message after item ${data.previousItemId}, agent: ${data.agentName || 'unknown'}`);
        const newItems = [...prev];
        newItems.splice(previousItemIndex + 1, 0, newItem);
        
        return newItems;
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
  }, [eventBus, clearTranscriptItems, addTranscriptBreadcrumb, setTranscriptItems, updateAgentContext]); 

  const contextValue = React.useMemo(() => ({
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItem,
    clearTranscriptItems,
    agentConversationContexts, // Expose agent conversation contexts
  }), [
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItem,
    clearTranscriptItems,
    agentConversationContexts,
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
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { GuardrailResultType, TranscriptItem } from '@/app/types';
import { runGuardrailClassifier } from '@/app/lib/callOai';

interface AssistantDeltaPayload {
  itemId: string;
  deltaText: string;
}

interface AssistantMessageCompletedPayload {
  itemId: string;
  fullText: string;
}

export function useTranscriptGuardrails() {
  const eventBus = useEventBus();
  const { transcriptItems, updateTranscriptItem } = useTranscript();
  const assistantDeltasRef = useRef<{ [itemId: string]: string }>({});

  const processGuardrail = useCallback(async (itemId: string, text: string) => {
    if (!text || text.trim() === "") return; // Don't process empty text
    console.log(`[useTranscriptGuardrails] Processing guardrail for item ${itemId}, text length: ${text.length}`);
    let res;
    try {
      res = await runGuardrailClassifier(text);
    } catch (error) {
      console.warn("[useTranscriptGuardrails] Error calling guardrail classifier:", error);
      return;
    }

    const currentItem = transcriptItems.find((item) => item.itemId === itemId);
    // Ensure we don't overwrite a more complete result from a concurrent/later check for the same item
    if (currentItem && (currentItem.guardrailResult?.testText?.length ?? 0) > text.length) {
      console.log(`[useTranscriptGuardrails] Skipping guardrail update for ${itemId}, existing result is more complete.`);
      return;
    }
    
    const newGuardrailResult: GuardrailResultType = {
      status: "DONE",
      testText: text,
      category: res.moderationCategory,
      rationale: res.moderationRationale,
    };

    console.log(`[useTranscriptGuardrails] Updating transcript item ${itemId} with guardrail result:`, newGuardrailResult.category);
    updateTranscriptItem(itemId, { guardrailResult: newGuardrailResult });
  }, [transcriptItems, updateTranscriptItem]);

  useEffect(() => {
    const handleDelta = (data: AssistantDeltaPayload) => {
      const { itemId, deltaText } = data;
      if (!assistantDeltasRef.current[itemId]) {
        assistantDeltasRef.current[itemId] = "";
      }
      assistantDeltasRef.current[itemId] += deltaText;
      const newAccumulated = assistantDeltasRef.current[itemId];
      const wordCount = newAccumulated.trim().split(" ").length;

      // Run guardrail classifier every 5 words for deltas
      if (wordCount > 0 && wordCount % 5 === 0) {
        // Check if this part of the text (up to wordCount) has already been processed
        // This is a simple check; more sophisticated would be to track processed word counts.
        // For now, we re-process, assuming `processGuardrail` handles overwrites correctly.
        processGuardrail(itemId, newAccumulated);
      }
    };

    const handleMessageCompleted = (data: AssistantMessageCompletedPayload) => {
      const { itemId, fullText } = data;
      // Ensure final guardrail check on the full text
      processGuardrail(itemId, fullText);
      // Clear accumulated deltas for this item as it's complete
      if (assistantDeltasRef.current[itemId]) {
        delete assistantDeltasRef.current[itemId];
      }
    };

    eventBus.on(KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED, handleDelta);
    eventBus.on(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, handleMessageCompleted);
    
    return () => {
      eventBus.off(KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED, handleDelta);
      eventBus.off(KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED, handleMessageCompleted);
    };
  }, [eventBus, processGuardrail]);

  // This hook is self-contained and doesn't need to return anything.
} 
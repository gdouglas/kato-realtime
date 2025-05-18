"use client";

import { useRef } from "react";
import {
  ServerEvent,
  AgentConfig,
  GuardrailResultType,
} from "@/app/types";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { runGuardrailClassifier } from "@/app/lib/callOai";
import { AgentLifecycleMachineEvent } from "@/app/machines/katoAgentLifecycleMachine";

export interface UseHandleServerEventParams {
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  logClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  sendToMachine: (event: AgentLifecycleMachineEvent) => void;
  shouldForceResponse?: boolean;
  setIsOutputAudioBufferActive: (active: boolean) => void;
}

export function useHandleServerEvent({
  selectedAgentName,
  selectedAgentConfigSet,
  logClientEvent,
  sendToMachine,
  setIsOutputAudioBufferActive,
}: UseHandleServerEventParams) {
  const {
    transcriptItems,
    addTranscriptBreadcrumb,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItem,
  } = useTranscript();

  const { logServerEvent } = useEvent();

  const assistantDeltasRef = useRef<{ [itemId: string]: string }>({});

  async function processGuardrail(itemId: string, text: string) {
    let res;
    try {
      res = await runGuardrailClassifier(text);
    } catch (error) {
      console.warn(error);
      return;
    }

    const currentItem = transcriptItems.find((item) => item.itemId === itemId);
    if ((currentItem?.guardrailResult?.testText?.length ?? 0) > text.length) {
      // If the existing guardrail result is more complete, skip updating. We're running multiple guardrail checks and you don't want an earlier one to overwrite a later, more complete result.
      return;
    }
    
    const newGuardrailResult: GuardrailResultType = {
      status: "DONE",
      testText: text,
      category: res.moderationCategory,
      rationale: res.moderationRationale,
    };

    // Update the transcript item with the new guardrail result.
    updateTranscriptItem(itemId, { guardrailResult: newGuardrailResult });
  }

  const handleFunctionCall = async (functionCallParams: {
    name: string;
    call_id?: string;
    arguments: string;
  }) => {
    const args = JSON.parse(functionCallParams.arguments);
    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    addTranscriptBreadcrumb(`function call: ${functionCallParams.name}`, args);

    if (currentAgent?.toolLogic?.[functionCallParams.name]) {
      const fn = currentAgent.toolLogic[functionCallParams.name];
      const fnResult = await fn(args, transcriptItems);
      addTranscriptBreadcrumb(
        `function call result: ${functionCallParams.name}`,
        fnResult
      );

      logClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(fnResult),
        },
      });
      logClientEvent({ type: "response.create" });
    } else if (functionCallParams.name === "transferAgents") {
      const destinationAgent = args.destination_agent;
      const newAgentConfig =
        selectedAgentConfigSet?.find((a) => a.name === destinationAgent) ||
        null;
      if (newAgentConfig) {
        sendToMachine({ type: 'SERVER_REQUESTED_AGENT_TRANSFER', agentName: destinationAgent });
        
        logClientEvent(
          { type: "output_audio_buffer.clear" },
          "(clear audio before voice change)"
        );
        
        setTimeout(() => {
          const voice = newAgentConfig.voice || "sage";
          const instructions = newAgentConfig.instructions || "";
          const tools = newAgentConfig.tools || [];
          
          logClientEvent({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions,
              voice,
              input_audio_transcription: { model: "whisper-1" },
              tools,
            }
          }, "(update after agent transfer)");
        }, 300);
      }
      
      const functionCallOutput = {
        destination_agent: destinationAgent,
        did_transfer: !!newAgentConfig,
      };
      logClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(functionCallOutput),
        },
      });
      addTranscriptBreadcrumb(
        `function call: ${functionCallParams.name} response`,
        functionCallOutput
      );
    } else {
      const simulatedResult = { result: true };
      addTranscriptBreadcrumb(
        `function call fallback: ${functionCallParams.name}`,
        simulatedResult
      );

      logClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(simulatedResult),
        },
      });
      logClientEvent({ type: "response.create" });
    }
  };

  const handleServerEvent = (serverEvent: ServerEvent) => {
    logServerEvent(serverEvent);

    switch (serverEvent.type) {
      // These cases are now handled by the XState machine emitting events on the eventBus.
      // The machine emits:
      // - KatoEvents.SERVER_SESSION_CREATED
      // - KatoEvents.OUTPUT_AUDIO_BUFFER_STATUS_CHANGED
      // - KatoEvents.SERVER_TRANSCRIPT_ITEM_CREATED
      // - KatoEvents.SERVER_USER_TRANSCRIPT_COMPLETED
      // - KatoEvents.SERVER_ASSISTANT_DELTA_RECEIVED
      // - KatoEvents.SERVER_ASSISTANT_MESSAGE_COMPLETED
      // - KatoEvents.SERVER_FUNCTION_CALL_REQUESTED
      // - KatoEvents.USER_SPEECH_STARTED / KatoEvents.USER_SPEECH_STOPPED

      /* REMOVED: session.created
      case "session.created": {
        if (serverEvent.session?.id) {
          addTranscriptBreadcrumb(
            `session.id: ${
              serverEvent.session.id
            }\nStarted at: ${new Date().toLocaleString()}`
          );
        }
        break;
      }
      */

      /* REMOVED: output_audio_buffer.started / .stopped
      case "output_audio_buffer.started": {
        setIsOutputAudioBufferActive(true);
        break;
      }
      case "output_audio_buffer.stopped": {
        setIsOutputAudioBufferActive(false);
        break;
      }
      */

      /* REMOVED: conversation.item.created
      case "conversation.item.created": {
        let text =
          serverEvent.item?.content?.[0]?.text ||
          serverEvent.item?.content?.[0]?.transcript ||
          "";
        const role = serverEvent.item?.role as "user" | "assistant";
        const itemId = serverEvent.item?.id;

        if (itemId && transcriptItems.some((item) => item.itemId === itemId)) {
          // don't add transcript message if already exists
          break;
        }

        if (itemId && role) {
          if (role === "user" && !text) {
            text = "[Transcribing...]";
          }
          addTranscriptMessage(itemId, role, text);
        }
        break;
      }
      */

      /* REMOVED: conversation.item.input_audio_transcription.completed
      case "conversation.item.input_audio_transcription.completed": {
        const itemId = serverEvent.item_id;
        const finalTranscript =
          !serverEvent.transcript || serverEvent.transcript === "\n"
            ? "[inaudible]"
            : serverEvent.transcript;
        if (itemId) {
          updateTranscriptMessage(itemId, finalTranscript, false);
        }
        break;
      }
      */

      /* REMOVED: response.audio_transcript.delta (partially - processGuardrail remains for now)
      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id;
        const deltaText = serverEvent.delta || "";
        if (itemId) {
          // Update the transcript message with the new text.
          // updateTranscriptMessage(itemId, deltaText, true); // Now handled by eventBus subscriber

          // Accumulate the deltas and run the output guardrail at regular intervals.
          if (!assistantDeltasRef.current[itemId]) {
            assistantDeltasRef.current[itemId] = "";
          }
          assistantDeltasRef.current[itemId] += deltaText;
          const newAccumulated = assistantDeltasRef.current[itemId];
          const wordCount = newAccumulated.trim().split(" ").length;

          // Run guardrail classifier every 5 words.
          if (wordCount > 0 && wordCount % 5 === 0) {
            processGuardrail(itemId, newAccumulated);
          }
        }
        break;
      }
      */
      // Retaining the processGuardrail logic from response.audio_transcript.delta temporarily.
      // This will be moved to a dedicated subscriber for SERVER_ASSISTANT_DELTA_RECEIVED later.
      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id;
        const deltaText = serverEvent.delta || "";
        if (itemId) {
           // Accumulate the deltas and run the output guardrail at regular intervals.
          if (!assistantDeltasRef.current[itemId]) {
            assistantDeltasRef.current[itemId] = "";
          }
          assistantDeltasRef.current[itemId] += deltaText;
          const newAccumulated = assistantDeltasRef.current[itemId];
          const wordCount = newAccumulated.trim().split(" ").length;

          // Run guardrail classifier every 5 words.
          if (wordCount > 0 && wordCount % 5 === 0) {
            processGuardrail(itemId, newAccumulated);
          }
        }
        break;
      }

      /* REMOVED: response.done (partially - handleFunctionCall remains if not triggered by machine event yet)
      case "response.done": {
        if (serverEvent.response?.output) {
          serverEvent.response.output.forEach((outputItem) => {
            if (
              outputItem.type === "function_call" &&
              outputItem.name &&
              outputItem.arguments
            ) {
              // handleFunctionCall is called if SERVER_FUNCTION_CALL_REQUESTED is not yet handled by a dedicated service
              // For now, this direct call path might still be active if the new event isn't consumed for function calls.
              // Ultimately, this direct call should be removed.
              // handleFunctionCall({
              //   name: outputItem.name,
              //   call_id: outputItem.call_id,
              //   arguments: outputItem.arguments,
              // });
            } else if (
              outputItem.type === "message" &&
              outputItem.role === "assistant" &&
              outputItem.content?.[0]?.type === "text"
            ) {
              // const itemId = outputItem.id;
              // const textContent = outputItem.content[0].text;
              // if (itemId && textContent) {
                // updateTranscriptMessage(itemId, textContent, false); // Now handled by eventBus subscriber
                // processGuardrail(itemId, textContent); // Run guardrail on full message completion
              // }
            }
          });
        }
        // Final guardrail check on accumulated deltas if any
        Object.keys(assistantDeltasRef.current).forEach((itemId) => {
          const fullText = assistantDeltasRef.current[itemId];
          if (fullText) {
            processGuardrail(itemId, fullText);
          }
          delete assistantDeltasRef.current[itemId]; // Clear after processing
        });
        break;
      }
      */
      // Retaining parts of response.done temporarily for final guardrail and clearing deltas.
      // This will be addressed when guardrail and function call handling are fully moved.
      case "response.done": {
         if (serverEvent.response?.output) {
          serverEvent.response.output.forEach((outputItem) => {
            if (
              outputItem.type === "message" &&
              outputItem.role === "assistant" &&
              outputItem.content?.[0]?.type === "text"
            ) {
              const itemId = outputItem.id;
              const textContent = outputItem.content[0].text;
              if (itemId && textContent) {
                 processGuardrail(itemId, textContent); // Run guardrail on full message completion
              }
            }
          });
        }
        // Final guardrail check on accumulated deltas if any
        Object.keys(assistantDeltasRef.current).forEach((itemId) => {
          const fullText = assistantDeltasRef.current[itemId];
          if (fullText) {
            processGuardrail(itemId, fullText);
          }
          delete assistantDeltasRef.current[itemId]; // Clear after processing
        });
        break;
      }
      
      /* REMOVED: response.output_item.done
      case "response.output_item.done": {
        const item = serverEvent.item;
        if (item?.type === "message" && item.role === "assistant") {
          const textContent =
            item.content?.[0]?.type === "text"
              ? item.content[0].text
              : item.content?.[0]?.type === "audio"
              ? item.content[0].transcript
              : null;
          if (item.id && textContent) {
            // updateTranscriptMessage(item.id, textContent, false); // Now handled by eventBus subscriber
            // processGuardrail(item.id, textContent); // Run guardrail on full message completion
          }
        } else if (item?.type === "function_call_output") {
          // Nothing to do here from client perspective for the output item itself being done.
          // We care about the function call *request* and then sending our *result*.
        }
        break;
      }
      */

      // This case is for LOCAL function call simulation if RTC is not connected (from App.tsx sendMessage)
      // It should eventually be replaced by a system where tools are invoked via events regardless of RTC state.
      case "function.call": {
        // Assuming this specific event structure based on its creation in App.tsx sendMessage
        const localFuncCallEvent = serverEvent as {
          type: "function.call";
          item_id: string; // item_id was included in App.tsx usage
          function: { name: string; call_id?: string; arguments: string };
        };
        if (localFuncCallEvent.function) {
          handleFunctionCall(localFuncCallEvent.function);
        }
        break;
      }

      default:
        console.warn(
          `[useHandleServerEvent] Unhandled server event type: ${serverEvent.type}`,
          serverEvent
        );
        break;
    }
  };

  const handleServerEventRef = useRef(handleServerEvent);
  handleServerEventRef.current = handleServerEvent;

  return handleServerEventRef;
}

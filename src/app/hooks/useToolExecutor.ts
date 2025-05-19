'use client';

import { useEffect, useCallback } from 'react';
import { AgentConfig, TranscriptItem } from '@/app/types';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { useAgentContext } from '@/app/contexts/AgentContext';
import { useEvent } from '@/app/contexts/EventContext';
import { useAgentLifecycle } from '@/app/contexts/AgentLifecycleContext';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { AgentLifecycleMachineEvent } from '@/app/machines/katoAgentLifecycleMachine';

interface ServerFunctionCallPayload {
  callId?: string;
  functionName: string;
  argsString: string;
}

export function useToolExecutor() {
  const eventBus = useEventBus();
  const { transcriptItems, addTranscriptBreadcrumb } = useTranscript();
  const { currentAgentConfig: agentConfigFromAgentContext } = useAgentContext(); 
  const { logClientEvent } = useEvent();
  const agentLifecycle = useAgentLifecycle();
  
  const currentAgentConfig = agentConfigFromAgentContext || agentLifecycle.state.context.currentAgentConfig;
  const selectedAgentName = agentLifecycle.state.context.selectedAgentName;
  const agentConfigs = agentLifecycle.state.context.agentConfigs;

  const handleFunctionCall = useCallback(async (params: { name: string; call_id?: string; arguments: string }) => {
    const functionName = params.name;
    const callId = params.call_id || `local-${Date.now()}`;

    if (!currentAgentConfig && functionName !== "transferAgents") {
        const errorMsg = `Agent ${selectedAgentName} not configured or tool ${functionName} not found.`;
        console.warn(`[useToolExecutor] ${errorMsg}`);
        logClientEvent({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ error: errorMsg }) },
        }, `error.tool_execution.${functionName}`);
        eventBus.emit('TOOL_EXECUTOR_FAILURE' as any, { callId, functionName, error: errorMsg });
        return;
    }
    
    let args;
    try {
        args = JSON.parse(params.arguments);
    } catch (e) {
        const errorMsg = `Invalid arguments for function ${functionName}: ${(e as Error).message}`;
        console.error(`[useToolExecutor] Error parsing arguments for function ${functionName}: ${params.arguments}`, e);
        logClientEvent({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ error: errorMsg }) },
        }, `error.tool_args_parsing.${functionName}`);
        eventBus.emit('TOOL_EXECUTOR_FAILURE' as any, { callId, functionName, error: errorMsg });
        return;
    }

    addTranscriptBreadcrumb(`[ToolExecutor] Function call: ${functionName}`, args);

    if (functionName === "transferAgents") {
      const destinationAgent = args.destination_agent;
      const newAgentConfig = agentConfigs?.find((a) => a.name === destinationAgent) || null;
      
      if (newAgentConfig) {
        agentLifecycle.send({ type: 'SERVER_REQUESTED_AGENT_TRANSFER', agentName: destinationAgent });
      }
      
      const functionCallOutput = {
        destination_agent: destinationAgent,
        did_transfer_request_sent: !!newAgentConfig,
      };
      logClientEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(functionCallOutput) },
      }, `tool.transferAgents.output`);
      addTranscriptBreadcrumb(
        `[ToolExecutor] Function call ${functionName} outcome: request sent ${!!newAgentConfig}`,
        functionCallOutput
      );
      eventBus.emit('TOOL_EXECUTOR_SUCCESS' as any, { callId, functionName, result: functionCallOutput });
    } else if (currentAgentConfig?.toolLogic?.[functionName]) {
      const fn = currentAgentConfig.toolLogic[functionName];
      try {
        const fnResult = await fn(args, transcriptItems);
        addTranscriptBreadcrumb(
          `[ToolExecutor] Function call result: ${functionName}`,
          fnResult
        );
        logClientEvent({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: JSON.stringify(fnResult) },
        }, `tool.${functionName}.output`);
        eventBus.emit('TOOL_EXECUTOR_SUCCESS' as any, { callId, functionName, result: fnResult });
      } catch (e) {
        const errorMsg = `Tool ${functionName} execution failed: ${(e as Error).message}`;
        console.error(`[useToolExecutor] Error executing tool ${functionName}:`, e);
        addTranscriptBreadcrumb(`[ToolExecutor] Error in tool ${functionName}:`, { details: errorMsg });
        logClientEvent({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ error: errorMsg }) },
        }, `error.tool_execution.${functionName}`);
        eventBus.emit('TOOL_EXECUTOR_FAILURE' as any, { callId, functionName, error: errorMsg });
      }
    } else {
      const errorMsg = "Tool not found or no toolLogic defined for current agent.";
      const simulatedResult = { error: errorMsg };
      addTranscriptBreadcrumb(
        `[ToolExecutor] Function call fallback (tool not found): ${functionName}`,
        simulatedResult
      );
      logClientEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(simulatedResult) },
      }, `fallback.tool_not_found.${functionName}`);
      eventBus.emit('TOOL_EXECUTOR_FAILURE' as any, { callId, functionName, error: errorMsg });
    }
  }, [
    currentAgentConfig, 
    selectedAgentName, 
    agentConfigs,
    transcriptItems, 
    addTranscriptBreadcrumb, 
    logClientEvent, 
    agentLifecycle.send,
    eventBus
  ]);

  useEffect(() => {
    const subscription = (data: ServerFunctionCallPayload) => {
      console.log('[useToolExecutor] Received SERVER_FUNCTION_CALL_REQUESTED:', data);
      handleFunctionCall({
        name: data.functionName,
        call_id: data.callId,
        arguments: data.argsString,
      });
    };

    eventBus.on(KatoEvents.SERVER_FUNCTION_CALL_REQUESTED, subscription);
    
    return () => {
      eventBus.off(KatoEvents.SERVER_FUNCTION_CALL_REQUESTED, subscription);
    };
  }, [eventBus, handleFunctionCall]);
} 
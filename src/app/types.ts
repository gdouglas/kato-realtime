import { z } from "zod";

// Define the allowed moderation categories only once
export const MODERATION_CATEGORIES = [
  "OFFENSIVE",
  "OFF_BRAND",
  "VIOLENCE",
  "NONE",
] as const;

// Derive the union type for ModerationCategory from the array
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

// Create a Zod enum based on the same array
export const ModerationCategoryZod = z.enum([...MODERATION_CATEGORIES]);

export type SessionStatus = "IDLE" | "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

// New transition-related types for agent voice switching
export type TransitionStatus = "IDLE" | "TRANSITIONING" | "FAILED";

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  pattern?: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ToolParameterProperty;
}

export interface ToolParameters {
  type: string;
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface Tool {
  type: "function";
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface AgentConfig {
  name: string;
  displayName?: string;
  publicDescription: string; // gives context to agent transfer tool
  instructions: string;
  tools: Tool[];
  model?: string; // Optional model specification
  voice?: string; // Optional voice setting for text-to-speech
  introAudio?: { // Optional introductory audio message configuration
    text: string; // The text to be spoken
    instructions?: string; // Optional instructions for TTS voice affect, tone, pacing etc.
    voice?: string; // Optional voice for TTS (e.g., 'shimmer', 'alloy')
    model?: string; // Optional TTS model (e.g., 'gpt-4o-mini-tts')
  };
  toolLogic?: Record<
    string,
    (args: any, transcriptLogsFiltered: TranscriptItem[]) => Promise<any> | any
  >;
  downstreamAgents?:
    | AgentConfig[]
    | { name: string; publicDescription: string }[];
}

export type AllAgentConfigsType = Record<string, AgentConfig[]>;

export interface GuardrailResultType {
  status: "IN_PROGRESS" | "DONE";
  testText?: string; 
  category?: ModerationCategory;
  rationale?: string;
}

export interface TranscriptItem {
  itemId: string;
  type: "MESSAGE" | "BREADCRUMB";
  role?: "user" | "assistant" | "system" | "function_call" | "function_call_output";
  title?: string;
  data?: Record<string, any>;
  expanded: boolean;
  timestamp: string;
  createdAtMs: number;
  status: "IN_PROGRESS" | "DONE";
  isHidden: boolean;
  guardrailResult?: GuardrailResultType;
  agentName?: string;
}

// Agent state for tracking agent-specific context
export interface AgentState {
  agentName: string;
  voice?: string;
  model?: string;
  instructions?: string;
  lastInteractionMs?: number;
  contextItems?: TranscriptItem[];
}

// Transition state for managing reconnection
export interface TransitionState {
  status: TransitionStatus;
  fromAgent?: string;
  toAgent?: string;
  startTimeMs?: number;
  error?: string;
  preservedContext?: SimplifiedContext[];
}

// Conversation state for persistence
export interface ConversationState {
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  transcript: TranscriptItem[];
  agents: Record<string, AgentState>;
  currentAgent?: string;
  transition: TransitionState;
  version: string; // For future compatibility
}

// Simplified context format for context assembly
export interface SimplifiedContext {
  role: string;
  content: string;
  isSystemMessage?: boolean;
  agentName?: string;
}

export interface Log {
  id: number;
  timestamp: string;
  direction: string;
  eventName: string;
  data: any;
  expanded: boolean;
  type: string;
}

export interface ServerEvent {
  type: string;
  event_id?: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  session?: {
    id?: string;
  };
  item?: {
    id?: string;
    object?: string;
    type?: string;
    status?: string;
    name?: string;
    arguments?: string;
    role?: "user" | "assistant";
    content?: {
      type?: string;
      transcript?: string | null;
      text?: string;
    }[];
  };
  response?: {
    output?: {
      id: string;
      type?: string;
      name?: string;
      arguments?: any;
      call_id?: string;
      role: string;
      content?: any;
    }[];
    metadata: Record<string, any>;
    status_details?: {
      error?: any;
    };
  };
}

export interface LoggedEvent {
  id: number;
  direction: "client" | "server";
  expanded: boolean;
  timestamp: string;
  eventName: string;
  eventData: Record<string, any>; // can have arbitrary objects logged
}

// Update the GuardrailOutputZod schema to use the shared ModerationCategoryZod
export const GuardrailOutputZod = z.object({
  moderationRationale: z.string(),
  moderationCategory: ModerationCategoryZod,
});

export type GuardrailOutput = z.infer<typeof GuardrailOutputZod>;

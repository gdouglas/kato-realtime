# Agent Switcher Feature Overview

This document outlines the agent switching functionality within the Kato Realtime Patient Simulator application. This feature allows the user to seamlessly transition between different conversational AI agents, such as a "Patient" agent and a "Preceptor" agent, during an interactive session.

## Core Functionality

The primary goal of the agent switcher is to enable dynamic changes in the conversational partner. Each agent (e.g., Patient, Preceptor) can have distinct characteristics, including:

*   **Personality and Knowledge Base**: Defined by their specific instructions and configuration.
*   **Voice**: Each agent can have a unique voice for text-to-speech (TTS) output.

## Technical Implementation for Voice Switching

A key technical aspect of the agent switching feature arises from a limitation in the underlying OpenAI Realtime API: **it is not possible to change the `voice` parameter within an active Realtime API session after the model has generated audio once.**

To overcome this and allow each agent to have a distinct voice, the application implements the following strategy:

1.  **Session Termination**: When the user initiates an agent switch (e.g., by selecting a different agent in the UI), the `katoAgentLifecycleMachine` (the central state machine) orchestrates the shutdown of the current WebRTC connection and the associated OpenAI Realtime API session.
2.  **New Session Creation**: A new WebRTC connection is immediately established, and a new OpenAI Realtime API session is created by the state machine.
3.  **Agent Configuration**: This new session is configured with the specific parameters of the newly selected agent, including their unique `voice`, `instructions`, and any other relevant settings (like `tools`). This configuration is sent as a `session.update` message to the OpenAI API upon activation of the new agent.
4.  **Conversational Re-engagement**: If the newly selected agent's introductory audio has already been played in a previous interaction (and is therefore skipped in the current switch), the `katoAgentLifecycleMachine` automatically sends a simulated "Hi" message (`conversation.item.create` with `item: { type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] }` followed by a `response.create`) to the agent. This ensures the agent is prompted to respond and the conversation can resume smoothly without requiring the user to speak first after the switch.

This approach ensures that each agent can utilize its designated voice, providing a more distinct and immersive user experience, at the cost of a brief reconnection sequence during the switch.

## Relevant Files

Below is a list of key files involved in implementing the agent switcher feature:

*   `src/app/machines/katoAgentLifecycleMachine.ts`: The core XState state machine that manages the entire agent lifecycle, including the detailed logic for agent selection, disconnecting old WebRTC sessions, establishing and configuring new sessions for the selected agent (crucially setting the `voice`), and handling re-engagement logic like sending a simulated "Hi" if an intro is skipped.
*   `src/app/contexts/AgentLifecycleContext.tsx`: Provides the `katoAgentLifecycleMachine` instance and its state to the React component tree, making agent status and switching progress accessible.
*   `src/app/contexts/AgentContext.tsx`: Consumes information from `AgentLifecycleContext` and offers a simplified interface for components to select agents (triggering the `SELECT_AGENT` event in the state machine).
*   `src/app/lib/realtimeConnection.ts`: Contains utility functions, most notably `createRealtimeConnection`, used by the state machine to establish the underlying WebRTC peer connections and data channels necessary for each new agent session.
*   `src/app/cases/kato/speak/page.tsx`: The primary user interface where agent selection occurs. It interacts with `AgentContext` to initiate switches and reflects the current agent and switching status.
*   `src/app/types.ts`: Defines the `AgentConfig` TypeScript interface, which structures the configuration data for each agent, including their `name`, `instructions`, `voice`, `tools`, and `introAudio` settings.
*   `src/app/agentConfigs/` (directory): This directory houses the specific configuration files for each available agent (e.g., `medicalHistoryTaking/patient.ts`, `medicalHistoryTaking/preceptor.ts`). These files define the unique properties of each agent, including their voice.
*   `src/app/cases/kato/KatoEvents.ts`: Defines the various event types (e.g., `SELECT_AGENT`, `AGENT_SWITCH_STARTED`, `AGENT_SWITCH_COMPLETED`, `CURRENT_AGENT_CHANGED`) used for communication between the state machine, contexts, and UI components during the agent switching process. 
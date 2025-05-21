import { createMachine, forwardTo, assign } from "xstate";
import { agentSessionMachine } from "./session";
import { settingsMachine } from "./settings.machine";

export const rootMachine = createMachine({
  id: "root",
  context: {
    selectedAgent: null as string | null,
  },

  invoke: [
    { id: "settings", src: settingsMachine, autoForward: true },
  ],

  initial: "intro",

  states: {
    intro: {
      on: {
        SELECT_AGENT: {
          target: "session",
          actions: assign({ selectedAgent: (_, e: any) => e.agent }),
        },
      },
    },

    session: {
      invoke: {
        id: "sessionActor",
        src: agentSessionMachine,
        input: ({ context }) => ({ agentName: context.selectedAgent! }),
        onDone: "intro",
      },

      on: {
        SWITCH_TO_WRITE: { actions: forwardTo("settings") },
        SWITCH_TO_SPEAK: { actions: forwardTo("settings") },
      },
    },
  },
});

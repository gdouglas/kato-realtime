import { createMachine, sendTo } from "xstate";
import { introPlayerMachine } from "./introPlayer.machine";
import { rtcConnMachine } from "./rtcConn.machine";

export const agentSessionMachine = createMachine({
  id: "session",
  context: ({ input }: { input: { agentName: string } }) => ({
    agentName: input.agentName,
  }),

  initial: "intro",

  states: {
    intro: {
      invoke: {
        id: "intro",
        src: introPlayerMachine,
        input: ({ context }) => ({ agentName: context.agentName }),
        onDone: "rtc",
      },
    },

    rtc: {
      invoke: {
        id: "rtc",
        src: rtcConnMachine,
        onDone: "finished",
        onError: "failed",
      },
      on: {
        USER_SPEECH: { actions: sendTo("rtc") },
        USER_TEXT:   { actions: sendTo("rtc") },
        SWITCH_AGENT:  "closing",
      },
    },

    closing: {
      invoke: {
        src: "rtcClose", // optional custom actor
        onDone: "finished",
      },
    },

    failed: {
      on: { RETRY: "rtc" },
    },

    finished: { type: "final" },
  },
});

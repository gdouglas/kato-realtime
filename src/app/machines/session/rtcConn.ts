import { createMachine, fromPromise } from "xstate";
import { createRealtimeConnection } from "@/app/lib/realtimeConnection";

export const rtcConnMachine = createMachine({
  id: "rtc",
  initial: "connecting",

  context: ({} as {
    pc?: RTCPeerConnection | null;
    dc?: RTCDataChannel | null;
  }),

  states: {
    connecting: {
      invoke: {
        id: "connect",
        src: fromPromise(async () => {
          const { pc, dc } = await createRealtimeConnection();
          return { pc, dc };
        }),
        onDone: {
          target: "connected",
          actions: assign({ pc: (_, e) => e.output.pc, dc: (_, e) => e.output.dc }),
        },
        onError: "error",
      },
    },

    connected: {
      on: { DISCONNECT: "closing" },
    },

    closing: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          input.pc?.close();
        }),
        onDone: "idle",
        onError: "error",
      },
    },

    idle: { type: "final" },
    error: { type: "final" },
  },
});

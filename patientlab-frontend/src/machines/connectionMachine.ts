// @ts-nocheck
import { createMachine, assign } from "xstate";
import { fetchEphemeralToken } from "@/api/openaiApi";

// Connection machine fetching an ephemeral token via shared API service
export const connectionMachine = createMachine(
  {
    id: "connection",
    initial: "idle",
    context: {
      token: undefined,
      error: undefined,
    } as any,
    states: {
      idle: {
        on: { INIT_CONNECTION: "fetchingToken" },
      },

      fetchingToken: {
        entry: "clearError",
        invoke: {
          id: "fetchToken",
          src: "fetchToken",
          onDone: {
            target: "connected",
            actions: "setToken",
          },
          onError: {
            target: "connectionError",
            actions: "setError",
          },
        },
      },

      connected: { type: "final" },

      connectionError: {
        on: { RETRY: "fetchingToken" },
      },
    },
  },
  {
    actions: {
      setToken: assign({ token: (_, event) => event.data }),
      setError: assign({ error: (_, event) => event.data.message }),
      clearError: assign({ error: () => undefined }),
    },
    services: {
      fetchToken: async () => {
        const result = await fetchEphemeralToken();
        // If your API returns an object, adjust accordingly
        return typeof result === "string" ? result : result.token;
      },
    },
  }
);

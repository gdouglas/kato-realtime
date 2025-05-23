// @ts-nocheck
import { createMachine, assign, log } from "xstate";
import { fetchEphemeralToken } from "@/api/openaiApi";

/**
 * connectionMachine: Fetches an ephemeral token and handles errors gracefully.
 * Added debug logging and robust error flow for tracing.
 */
export const connectionMachine = createMachine(
  {
    /** @xstate-layout N4IgpgJg5mDOIC5QGMD2A7dZkBcCWGAdHhADZgDEAkgHJUAqA+gMIDyNNAos-VewNoAGALqJQAB1Sw8+DGJAAPRACYAjAA5CawQE4ALAHZBBg8vXKDAZgA0IAJ4q9Owjp1WDhgGzK9ltQYBfANs0TGxZdEIAMzAcZAALPHQoelQAazB0CggMMGJ0ADd0vJi4+NSM9CFRJBBJaQj5JQQjTUF1Y2Uu9QBWHR7PA1sHBFUNQlU9ZQHBTx1LSwMe3SCQjCxcAkjShKSU4qywACcj1CPCcVIAQxwos4BbaNiEiszq+XqZLabHVUJ1VQmMYDebqdRDeyIAGEPxmHQ+dT6MHTVYgUIbCKEdHhLacE5nCgAJU49EJAE13rVPo1as01JptPojCYzBYbJCEMpBIIJuo9OC3O09IIpj0gsEQOhUBA4PJsZs5FSpF9FaBmgBaTzDRCa1HyzEkcgfZU0tWIVTKZwDHqqdp+HSeW187Wc5YTHpgyx85bCywivXrHFEHaJZKvdDGhrfWmIKYGGE6WbKObqTy9dpajm2yyEXxTQGI5Z9KYBsIKyL6yCRlURmMIMF6FxM8E9GYGTw9F2qG2ED09CwmVwegzqUsYrZYwPlvGnI7V02KWPKLuCHoucGWVyedqmS2j8VAA */
    
    id: "connection",
    initial: "idle",
    context: {
      token: undefined,
      error: undefined,
    } as any,
    states: {
      idle: {
        on: {
          INIT_CONNECTION: "fetchingToken",
        },
      },

      fetchingToken: {
        entry: [log("Entering fetchingToken state"), "clearError"],
        invoke: {
          id: "fetchToken",
          src: "fetchToken",
          onDone: {
            target: "connected",
            actions: [
              log((_, event) => `Token fetched successfully: ${event.data}`),
              "setToken",
            ],
          },
          onError: {
            target: "connectionError",
            actions: [
              log((_, event) => `Token fetch failed: ${(event.data as Error).message}`),
              "setError",
            ],
          },
        },
      },

      connected: {
        type: "final",
      },

      connectionError: {
        entry: log((context) => `In connectionError with message: ${context.error}`),
        on: {
          RETRY: "fetchingToken",
        },
      },
    },
  },
  {
    actions: {
      setToken: assign({ token: (_, event) => event.data }),
      setError: assign({ error: (_, event) => (event.data as Error).message }),
      clearError: assign({ error: () => undefined }),
    },
    services: {
      fetchToken: async () => {
        try {
          const result = await fetchEphemeralToken();
          // Adjust based on your API shape
          const token = typeof result === "string" ? result : result.token;
          if (!token) throw new Error("No token returned");
          return token;
        } catch (err: any) {
          // Re-throw so onError catches it
          throw new Error(err?.message || "Unknown fetch error");
        }
      },
    },
  }
);

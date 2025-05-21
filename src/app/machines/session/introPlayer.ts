import { createMachine, fromPromise } from "xstate";

export const introPlayerMachine = createMachine({
  id: "intro",
  initial: "loading",

  context: ({ input }: { input: { agentName: string } }) => ({
    agentName: input.agentName,
  }),

  states: {
    loading: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          // fetch TTS blob; return URL
          return "blob:url";
        }),
        onDone: "playing",
        onError: "skipped",
      },
    },

    playing: {
      invoke: {
        src: fromPromise(
          ({ input, self }) =>
            new Promise<void>((res, rej) => {
              const audio = new Audio(input); // blob url
              audio.onended = () => res();
              audio.onerror = () => rej();
              audio.play();
            })
        ),
        onDone: "done",
        onError: "skipped",
      },
    },

    skipped: { type: "final" },
    done: { type: "final" },
  },
});

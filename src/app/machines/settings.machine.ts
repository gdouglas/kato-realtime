import { createMachine, assign } from "xstate";

export interface SettingsCtx {
  mic: boolean;
  audioOut: boolean;
  vadMode: "server" | "ptt";
  uiMode: "intro" | "speak" | "write";
}

export const settingsMachine = createMachine({
  id: "settings",
  context: (): SettingsCtx => ({
    mic: true,
    audioOut: true,
    vadMode: "server",
    uiMode: "intro",
  }),

  on: {
    TOGGLE_MIC:  { actions: assign({ mic: ctx => !ctx.mic }) },
    TOGGLE_OUT:  { actions: assign({ audioOut: ctx => !ctx.audioOut }) },
    SET_VAD:     { actions: assign({ vadMode: (_ , e: any) => e.mode }) },
    SET_UI_MODE: { actions: assign({ uiMode: (_ , e: any) => e.mode }) },
  },
});

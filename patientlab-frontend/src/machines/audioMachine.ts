// src/machines/audioMachine.ts
import { createMachine } from 'xstate';

export const audioMachine = createMachine({
  id: 'audio',
  initial: 'write',
  states: {
    write: {
      on: { START_LISTENING: 'idle' }
    },
    idle: {
      on: { START_LISTENING: 'listening', STOP_LISTENING: 'write' }
    },
    listening: {
      on: { STOP_LISTENING: 'processing' }
    },
    processing: {
      on: { DONE: 'write' }
    }
  }
} as const);

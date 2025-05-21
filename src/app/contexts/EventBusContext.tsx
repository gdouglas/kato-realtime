/**
 * This file defines a React Context and Provider for managing and distributing
 * a global EventBus instance throughout the Kato application.
 *
 * Purpose:
 * - To make a single, shared instance of the `EventBus` (from `src/app/lib/eventBus.ts`)
 *   accessible to any component or hook within its Provider tree.
 * - To facilitate decoupled communication using the publish-subscribe pattern, where different
 *   parts of the application can emit and listen for events without direct dependencies.
 *
 * How to use:
 * 1. Wrap a high-level component (e.g., in `App.tsx` or the root of a feature area)
 *    with the `<EventBusProvider>`.
 * 2. In any child component or hook that needs to interact with the event bus:
 *    - Call the `useEventBus()` hook to get the shared `EventBus` instance.
 *    - Use this instance to `emit()` events or subscribe to events using `on()`.
 *
 * This context is crucial for integrating the `katoAgentLifecycleMachine` with the rest of the
 * application, as the machine expects an `EventBus` instance in its input and uses it to
 * communicate its state changes and processed server messages.
 */
import React, { createContext, useContext, ReactNode, useState } from 'react';
import { EventBus } from '@/app/lib/eventBus'; // Adjust path as needed

const EventBusContext = createContext<EventBus | null>(null);

export const useEventBus = (): EventBus => {
  const context = useContext(EventBusContext);
  if (!context) {
    throw new Error('useEventBus must be used within an EventBusProvider');
  }
  return context;
};

interface EventBusProviderProps {
  children: ReactNode;
}

export const EventBusProvider: React.FC<EventBusProviderProps> = ({ children }) => {
  // Create a new EventBus instance for each provider instance.
  // This ensures that if the provider is unmounted and remounted, a fresh bus is used.
  // It also means different parts of the app could have different buses if wrapped separately,
  // though typically you'd have one at the top level of the part of the app that needs it.
  const [eventBusInstance] = useState(() => new EventBus());

  return (
    <EventBusContext.Provider value={eventBusInstance}>
      {children}
    </EventBusContext.Provider>
  );
}; 
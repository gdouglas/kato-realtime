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
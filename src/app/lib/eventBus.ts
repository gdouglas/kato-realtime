/**
 * This file implements a simple, generic EventBus (also known as an event emitter or Pub/Sub system).
 *
 * Purpose:
 * - To allow different parts of the application to communicate with each other without being directly coupled.
 *   Components or services can emit events, and other components/services can subscribe to (listen for)
 *   those events and react accordingly.
 *
 * How it works:
 * - `on(eventName, handler)`: Subscribes a handler function to a specific event. Returns an unsubscribe function.
 * - `off(eventName, handler)`: Unsubscribes a specific handler from an event.
 * - `emit(eventName, data)`: Dispatches an event, calling all subscribed handlers with the provided data.
 *
 * When to use:
 * - When you need to broadcast information from one part of the application to potentially multiple listeners.
 * - To decouple modules, so they don't need direct references to each other to interact.
 * - For managing application-wide notifications or state changes that various parts of the UI or services
 *   need to be aware of.
 *
 * Key features of this implementation:
 * - Returns an unsubscribe function from `on` for easy cleanup.
 * - Protects against errors in individual handlers from stopping the processing of other handlers.
 * - Handles cases where a listener might unsubscribe itself while an event is being emitted.
 */
// A simple event emitter
type EventHandler = (data?: any) => void;

interface EventListeners {
  [eventName: string]: EventHandler[];
}

export class EventBus {
  private listeners: EventListeners = {};

  on(eventName: string, handler: EventHandler): () => void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(handler);
    // Return an unsubscribe function
    return () => {
      this.off(eventName, handler);
    };
  }

  off(eventName: string, handler: EventHandler): void {
    if (!this.listeners[eventName]) {
      return;
    }
    this.listeners[eventName] = this.listeners[eventName].filter(
      (l) => l !== handler
    );
  }

  emit(eventName: string, data?: any): void {
    if (!this.listeners[eventName]) {
      return;
    }
    // Iterate over a copy of the listeners array in case a handler unsubscribes itself
    [...this.listeners[eventName]].forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for event: ${eventName}`, error);
      }
    });
  }
} 
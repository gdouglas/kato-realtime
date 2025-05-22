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
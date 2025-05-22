# LocalStorage Persistence

## Overview

The LocalStorage Persistence feature enables conversation state to persist across page reloads, browser sessions, and agent transitions. This component is essential for maintaining conversation continuity in the client-side application without relying on server-side storage.

## Functionality

This feature handles:

1. **Saving Conversation State**: Automatically save state to localStorage at key points
2. **Loading Saved State**: Restore state when the application loads
3. **Data Compression**: Handle large conversation histories efficiently
4. **State Versioning**: Manage compatibility across application updates
5. **Error Recovery**: Handle corrupted or invalid state gracefully

## Key Components

### 1. Storage Manager

Central module for handling localStorage operations:

```typescript
class ConversationStorageManager {
  private readonly STORAGE_KEYS = {
    conversationState: "medical-education.conversation-state",
    version: "medical-education.data-version",
    lastSaved: "medical-education.last-saved",
  };
  
  private readonly CURRENT_VERSION = "1.0";
  
  // Save conversation state to localStorage
  public saveState(state: ConversationState): void {
    try {
      // Check size and compress if needed
      const stateString = JSON.stringify(state);
      
      if (stateString.length > 100000) {
        localStorage.setItem(
          this.STORAGE_KEYS.conversationState,
          this.compressState(state)
        );
      } else {
        localStorage.setItem(
          this.STORAGE_KEYS.conversationState,
          stateString
        );
      }
      
      // Update metadata
      localStorage.setItem(this.STORAGE_KEYS.version, this.CURRENT_VERSION);
      localStorage.setItem(this.STORAGE_KEYS.lastSaved, Date.now().toString());
      
    } catch (error) {
      console.error("Failed to save conversation state", error);
      // Consider fallback storage or error notification
    }
  }
  
  // Load conversation state from localStorage
  public loadState(): ConversationState | null {
    try {
      const savedState = localStorage.getItem(this.STORAGE_KEYS.conversationState);
      if (!savedState) return null;
      
      // Check if compressed
      if (savedState.startsWith('{"compressed":true')) {
        return this.decompressState(savedState);
      }
      
      // Parse and validate
      const state = JSON.parse(savedState);
      return this.validateState(state) ? state : null;
      
    } catch (error) {
      console.error("Failed to load conversation state", error);
      return null;
    }
  }
  
  // Clear all saved state
  public clearState(): void {
    localStorage.removeItem(this.STORAGE_KEYS.conversationState);
    localStorage.removeItem(this.STORAGE_KEYS.version);
    localStorage.removeItem(this.STORAGE_KEYS.lastSaved);
  }
  
  // Check if state exists
  public hasState(): boolean {
    return !!localStorage.getItem(this.STORAGE_KEYS.conversationState);
  }
  
  // Private helper methods
  private compressState(state: ConversationState): string {
    // Implementation of state compression
    // Could use techniques like LZ-based compression or selective pruning
    return JSON.stringify({
      compressed: true,
      data: this.compressData(JSON.stringify(state))
    });
  }
  
  private decompressState(compressedState: string): ConversationState {
    // Implementation of state decompression
    const parsed = JSON.parse(compressedState);
    return JSON.parse(this.decompressData(parsed.data));
  }
  
  private validateState(state: any): boolean {
    // Validate state structure and content
    // Check for required properties, data types, etc.
    return (
      state &&
      typeof state === "object" &&
      Array.isArray(state.transcriptItems) &&
      typeof state.agentConversations === "object"
    );
  }
}
```

### 2. Auto-Save Mechanism

Automatically save state at strategic points:

```typescript
function useConversationPersistence(conversationState: ConversationState) {
  const storageManager = useMemo(() => new ConversationStorageManager(), []);
  
  // Auto-save when state changes
  useEffect(() => {
    // Debounce to prevent excessive saves
    const saveTimeout = setTimeout(() => {
      storageManager.saveState(conversationState);
    }, 1000);
    
    return () => clearTimeout(saveTimeout);
  }, [conversationState, storageManager]);
  
  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      storageManager.saveState(conversationState);
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [conversationState, storageManager]);
  
  // Additional logic for loading state on initialization
  // ...
  
  return {
    clearConversationState: () => storageManager.clearState(),
    hasPersistedState: () => storageManager.hasState(),
  };
}
```

### 3. Compression Utilities

For handling large conversation histories:

```typescript
// Basic compression using common patterns in conversation data
function compressData(data: string): string {
  // We could use existing libraries like pako/lz-string
  // Or implement custom compression for conversation data
  // For example, replace common strings with shorter alternatives
  
  // Example simple approach (actual implementation would be more sophisticated)
  let compressed = data
    .replace(/"role":"user"/g, '"r":"u"')
    .replace(/"role":"assistant"/g, '"r":"a"')
    .replace(/"type":"MESSAGE"/g, '"t":"M"')
    .replace(/"type":"BREADCRUMB"/g, '"t":"B"')
    .replace(/"status":"DONE"/g, '"s":"D"')
    .replace(/"status":"IN_PROGRESS"/g, '"s":"P"');
  
  // Could apply actual compression algorithm here
  
  return compressed;
}

function decompressData(compressed: string): string {
  // Reverse the compression process
  let decompressed = compressed
    .replace(/"r":"u"/g, '"role":"user"')
    .replace(/"r":"a"/g, '"role":"assistant"')
    .replace(/"t":"M"/g, '"type":"MESSAGE"')
    .replace(/"t":"B"/g, '"type":"BREADCRUMB"')
    .replace(/"s":"D"/g, '"status":"DONE"')
    .replace(/"s":"P"/g, '"status":"IN_PROGRESS"');
  
  return decompressed;
}
```

### 4. Version Management

Handle evolution of state structure over time:

```typescript
function migrateState(state: any, fromVersion: string): ConversationState {
  // Logic to migrate from older versions to current format
  if (fromVersion === "1.0") {
    // Already current version
    return state as ConversationState;
  }
  
  if (fromVersion === "0.9") {
    // Example migration from version 0.9 to 1.0
    return {
      ...state,
      // Add any new required properties
      agentConversations: state.agentConversations || {
        preceptor: [],
        mrKato: []
      },
      // Transform any changed properties
      // ...
    };
  }
  
  // Handle other version migrations
  // ...
  
  // If we can't migrate, return a fresh state
  return createDefaultState();
}
```

## Implementation

### New Module: `src/app/lib/storagePersistence.ts`

This new module will contain:

1. **Storage Manager Class**:
   - Core localStorage operations
   - Compression and decompression
   - State validation

2. **React Hook for Integration**:
   - Auto-save functionality
   - Integration with component lifecycle
   - Error handling

3. **Utility Functions**:
   - Data compression algorithms
   - Version migration
   - State validation

## Integration Points

The LocalStorage Persistence feature will integrate with:

1. **App.tsx**: For initialization and reset functionality
2. **TranscriptContext**: For state access and updates
3. **Session Reconnection Handler**: For state persistence during transitions

## Technical Considerations

- **Storage Limits**: LocalStorage typically has a 5-10MB limit per domain
- **Performance Impact**: Large state operations can impact UI responsiveness
- **Privacy Considerations**: Sensitive medical information in browser storage
- **Error Recovery**: Robust handling of corrupted or invalid state

## Usage Examples

```typescript
// In App.tsx or a top-level component

const [conversationState, setConversationState] = useState<ConversationState>(
  () => {
    // Try to load from storage on initial render
    const storageManager = new ConversationStorageManager();
    return storageManager.loadState() || createDefaultState();
  }
);

// Use the persistence hook
const { clearConversationState, hasPersistedState } = useConversationPersistence(
  conversationState
);

// Reset button handler
const handleResetConversation = () => {
  if (window.confirm("Are you sure you want to reset the conversation?")) {
    clearConversationState();
    setConversationState(createDefaultState());
    // Disconnect and reconnect to start fresh
    disconnectFromRealtime();
    setTimeout(connectToRealtime, 500);
  }
};
``` 
# Settings Modal Architecture

## Event-Driven Pattern

- The modal and button do not manage their own open/close state directly.
- All open/close and settings changes are handled via the EventBus and XState/context.
- This allows any part of the app to open/close the modal or react to settings changes.

## XState Integration

- The XState machine (or a dedicated settings context) listens for `USER_UPDATED_SETTINGS` events.
- The current settings are stored in global state/context and can be read by any component.
- This ensures a single source of truth for settings, and enables advanced flows (e.g., persisting settings, syncing with server).

## UI Integration

- The gear icon button is placed in the app header, visible everywhere.
- The modal is rendered at the app root, so it overlays all pages. 
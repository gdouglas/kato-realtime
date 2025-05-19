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

---

# Implementation Plan & App Review

## 1. Integration Points in @app
- **App Header:** Add a `SettingsButton` (gear icon) to the header in `App.tsx` so it is visible on all pages.
- **Modal Mounting:** Render `SettingsModal` at the root level (e.g., in `App.tsx` or `layout.tsx`) so it overlays all content.
- **EventBus:** Use the existing EventBus for all open/close and settings update events.
- **XState Context:** Ensure the XState machine (or a new settings context) listens for `USER_UPDATED_SETTINGS` and updates global state accordingly.

## 2. Ensuring No Side Effects
- **Isolation:** The modal and button only communicate via events; they do not directly modify other app state.
- **Non-Intrusive:** No changes to existing business logic or UI flows except for the addition of the button and modal.
- **Backward Compatibility:** Existing mic/audio output logic should continue to function unless explicitly updated to listen to the new settings events.
- **Testing:** After implementation, verify that toggling settings does not break or interfere with other features (e.g., agent switching, transcript, etc.).

## 3. Extensibility & Future Features
- **Centralized State:** By using XState/context and events, new features (e.g., advanced audio controls, user profiles, accessibility options) can easily subscribe to or update settings.
- **Single Source of Truth:** All components can read the current mic/audio state from the same place, reducing bugs and duplication.
- **Event-Driven:** New UI or logic can be added by simply listening for the relevant events, without tight coupling.

## 4. Managing Active State of Microphone & Audio Output
- **SettingsModal** emits `USER_UPDATED_SETTINGS` with `{ micEnabled, audioOutputEnabled, pushToTalk }`.
- **XState/context** updates the global state and notifies any listeners.
- **Any component** (e.g., audio input/output hooks, toolbars) can read the current state and enable/disable features accordingly.
- **Future-proof:** This pattern supports adding more settings or syncing with server/user profiles as needed.

---

# Next Steps
1. Scaffold `SettingsButton` and `SettingsModal` components.
2. Add event listeners in XState/context for `USER_UPDATED_SETTINGS`.
3. Update audio input/output logic to respect the new settings state.
4. Test across all app flows to ensure no regressions.
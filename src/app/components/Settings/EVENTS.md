# Settings Events

## USER_REQUESTED_OPEN_SETTINGS_MODAL
- **Description:** Open the settings modal.
- **Emitted by:** SettingsButton (gear icon)
- **Consumed by:** SettingsModal

## USER_REQUESTED_CLOSE_SETTINGS_MODAL
- **Description:** Close the settings modal.
- **Emitted by:** SettingsModal (close button, ESC, click outside)
- **Consumed by:** SettingsModal

## USER_UPDATED_SETTINGS
- **Description:** Broadcast new settings.
- **Payload:** `{ micEnabled: boolean, audioOutputEnabled: boolean, pushToTalk: boolean }`
- **Emitted by:** SettingsModal (on toggle change)
- **Consumed by:** XState machine, global settings context, or any interested component 
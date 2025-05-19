import React, { useEffect, useState } from "react";
import { useEventBus } from "@/app/contexts/EventBusContext";
import { KatoEvents } from "@/app/cases/kato/KatoEvents";

interface SettingsModalProps {
  initialSettings?: {
    micEnabled: boolean;
    audioOutputEnabled: boolean;
    pushToTalk: boolean;
  };
}

const SettingsModal: React.FC<SettingsModalProps> = ({ initialSettings }) => {
  const eventBus = useEventBus();
  const [open, setOpen] = useState(false);
  const [micEnabled, setMicEnabled] = useState(initialSettings?.micEnabled ?? true);
  const [audioOutputEnabled, setAudioOutputEnabled] = useState(initialSettings?.audioOutputEnabled ?? true);
  const [pushToTalk, setPushToTalk] = useState(initialSettings?.pushToTalk ?? true);

  // Listen for open/close events
  useEffect(() => {
    const unsubOpen = eventBus.on(KatoEvents.USER_REQUESTED_OPEN_SETTINGS_MODAL, () => setOpen(true));
    const unsubClose = eventBus.on(KatoEvents.USER_REQUESTED_CLOSE_SETTINGS_MODAL, () => setOpen(false));
    return () => {
      unsubOpen();
      unsubClose();
    };
  }, [eventBus]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Fire event on settings change immediately on toggle
  const emitSettings = (next: { micEnabled?: boolean; audioOutputEnabled?: boolean; pushToTalk?: boolean }) => {
    const settings = {
      micEnabled: next.micEnabled !== undefined ? next.micEnabled : micEnabled,
      audioOutputEnabled: next.audioOutputEnabled !== undefined ? next.audioOutputEnabled : audioOutputEnabled,
      pushToTalk: next.pushToTalk !== undefined ? next.pushToTalk : pushToTalk,
    };
    console.log('[SettingsModal] Emitting USER_UPDATED_SETTINGS:', settings);
    eventBus.emit(KatoEvents.USER_UPDATED_SETTINGS, settings);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md relative">
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 dark:hover:text-white text-2xl"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
        >
          ×
        </button>
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span role="img" aria-label="Settings">⚙️</span> Settings
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={micEnabled}
              onChange={e => { setMicEnabled(e.target.checked); emitSettings({ micEnabled: e.target.checked }); }}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-800 dark:text-gray-200">Enable Microphone</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={audioOutputEnabled}
              onChange={e => { setAudioOutputEnabled(e.target.checked); emitSettings({ audioOutputEnabled: e.target.checked }); }}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-800 dark:text-gray-200">Enable Audio Output</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={pushToTalk}
              onChange={e => { setPushToTalk(e.target.checked); emitSettings({ pushToTalk: e.target.checked }); }}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-800 dark:text-gray-200">Push-to-Talk Mode</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal; 
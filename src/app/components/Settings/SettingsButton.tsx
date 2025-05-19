import React from "react";
import { useEventBus } from "@/app/contexts/EventBusContext";
import { KatoEvents } from "@/app/cases/kato/KatoEvents";
import { FiSettings } from "react-icons/fi";

const SettingsButton: React.FC = () => {
  const eventBus = useEventBus();
  return (
    <button
      className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
      style={{ position: 'relative' }}
      aria-label="Open settings"
      onClick={() => eventBus.emit(KatoEvents.USER_REQUESTED_OPEN_SETTINGS_MODAL)}
    >
      <FiSettings size={24} className="text-gray-700 dark:text-gray-200" />
    </button>
  );
};

export default SettingsButton; 
/**
 * App.tsx - Minimal Root Application Component
 *
 * Following a refactoring, this App.tsx component now serves a minimal role.
 * It is the default component rendered by `src/app/page.tsx` when no specific case route (e.g., /cases/kato/speak) is active.
 * Its primary purpose is to display a placeholder message, guiding users or developers
 * to the actual application functionality within the case-specific pages (e.g., under `src/app/cases/*`).
 *
 * All global context providers (like AgentLifecycleProvider, EventBusProvider, TranscriptProvider, etc.)
 * and the main application layout (including the header and settings modal) have been centralized
 * in `src/app/client-layout.tsx`. This ensures that these global elements are consistently applied
 * across all parts of the application, including the specialized case pages.
 *
 * This component itself no longer manages complex state, hooks, or UI elements beyond its placeholder content.
 */
"use client";

import React from "react";

function AppContents() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 justify-center items-center">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
        Hello from App.tsx
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mt-2">
        The main application content for specific cases is now handled in their respective page.tsx files.
      </p>
      <p className="text-gray-600 dark:text-gray-400">
        Global providers and layout are in client-layout.tsx.
      </p>
    </div>
  );
}

const App: React.FC = () => {
  return <AppContents />;
};

export default App;

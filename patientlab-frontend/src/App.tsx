import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SpeakPage from '@/routes/SpeakPage';
import WritePage from '@/routes/WritePage';
import { useMachine } from '@xstate/react';
import { appMachine } from '@/machines/appMachine';
import { createBrowserInspector } from '@statelyai/inspect';

const { inspect } = createBrowserInspector({
  // Comment out the line below to start the inspector
  autoStart: true
});


export default function App() {
  const [state, send] = useMachine(appMachine, {
    inspect
  });


  return (
    <div className="h-screen w-screen bg-gray-50">
      <div className='border-pink-300 text-gray-950 w-50 h-50 bg-red-200'>Hi everyone!</div>
      <Routes>
        <Route path="/speak" element={<SpeakPage />} />
        <Route path="/write" element={<WritePage />} />
        <Route path="/*" element={<Navigate to="/speak" replace />} />
      </Routes>
    </div>
  );
}
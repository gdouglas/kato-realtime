"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { useAgentContext } from '@/app/contexts/AgentContext';
import { useAgentLifecycle } from '@/app/contexts/AgentLifecycleContext';
import { useIntroAudio } from '@/app/hooks/useIntroAudio';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { TranscriptItem, SessionStatus, AgentConfig } from '@/app/types';
import BottomBar from "@/app/components/BottomBar/BottomBar";
import CaseInfoModal from "@/app/components/CaseInfoModal";
import { KatoEvents } from '@/app/cases/kato/KatoEvents';
import { v4 as uuidv4 } from "uuid";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const WritePage = () => {
  const { transcriptItems, addTranscriptBreadcrumb } = useTranscript();
  const router = useRouter();
  const agentLifecycle = useAgentLifecycle();
  const eventBus = useEventBus();
  const { 
    sessionStatus,
    currentAgentConfig,
  } = agentLifecycle.state.context;
  const { 
    isSwitchingInProgress,
  } = useAgentContext();
  const { isIntroAudioPlaying } = useIntroAudio({ addTranscriptBreadcrumb });

  const [isCaseInfoModalOpen, setIsCaseInfoModalOpen] = useState<boolean>(false);

  const messages = transcriptItems.filter(
    (item): item is TranscriptItem & { type: 'MESSAGE' } => item.type === 'MESSAGE' && !item.isHidden
  );

  const onToggleConnection = () => {
    if (!currentAgentConfig) {
      addTranscriptBreadcrumb("No agent selected. Cannot connect.");
      console.error("No agent selected, cannot toggle connection");
      return;
    }
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      agentLifecycle.send({ type: "USER_REQUESTED_DISCONNECT" });
    } else {
      if (agentLifecycle.state.matches('idle')) {
        if (currentAgentConfig && currentAgentConfig.name) {
          agentLifecycle.send({ type: 'SELECT_AGENT', agentName: currentAgentConfig.name });
        } else {
          addTranscriptBreadcrumb("No agent configured to select for connection.");
          console.error("No agent selected for SELECT_AGENT.");
        }
      } else {
        // Fallback for other non-connected states (e.g., error states), mirroring speak page logic
        addTranscriptBreadcrumb("Attempting to retry connection...");
        agentLifecycle.send({ type: 'RETRY' });
      }
    }
  };

  const handleCreateDDx = async () => {
    if (!currentAgentConfig) {
      console.error("Cannot create DDx, no current agent config");
      addTranscriptBreadcrumb("Error: No agent selected to create DDx for.");
      return;
    }
    const uniqueId = uuidv4();
    console.log("DDX Create Clicked (Write Page):", { agent: currentAgentConfig.name, ddx_session_id: uniqueId });
    addTranscriptBreadcrumb(`Starting DDx creation for ${currentAgentConfig.publicDescription}...`);
    try {
      const response = await fetch(`${API_BASE_URL}/cases/kato/ddx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_name: currentAgentConfig.name, ddx_session_id: uniqueId }), 
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      if (data.ddx_url) {
        addTranscriptBreadcrumb(`DDx created successfully. Redirecting...`);
        router.push(data.ddx_url);
      } else {
        throw new Error("DDx URL not found in response");
      }
    } catch (error) {
      console.error("Error creating DDx:", error);
      addTranscriptBreadcrumb(`Error creating DDx: ${error instanceof Error ? error.message : String(error)}`);
      console.log("DDX Create Failed (Write Page):", { agent: currentAgentConfig.name, ddx_session_id: uniqueId, error: String(error) });
    }
  };

  return (
    <div className="p-4 h-full flex flex-col pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">Transcribed Messages</h1>
        <Link href="/cases/kato/speak" passHref>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition ease-in-out duration-150">
            Go to Speak Page
          </button>
        </Link>
      </div>
      {messages.length === 0 ? (
        <div className="flex-grow flex items-center justify-center text-gray-500">
          No messages yet.
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto flex-grow">
          {messages.map((item) => (
            <li key={item.itemId} className={`p-3 rounded-lg shadow-sm ${item.role === 'user' ? 'bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200' : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
              <span className="font-semibold capitalize">{item.role}: </span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}
      <CaseInfoModal isOpen={isCaseInfoModalOpen} onClose={() => setIsCaseInfoModalOpen(false)} />
      <BottomBar 
        sessionStatus={sessionStatus as SessionStatus}
        currentAgentConfig={currentAgentConfig as AgentConfig | null | undefined}
        isSwitchingInProgress={isSwitchingInProgress}
        isIntroAudioPlaying={isIntroAudioPlaying}
        onToggleConnection={onToggleConnection}
        onNavigateToWrite={() => router.push('/cases/kato/write')}
        onCreateDDx={handleCreateDDx}
      />
    </div>
  );
};

export default WritePage;

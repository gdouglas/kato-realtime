"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEventBus } from '@/app/contexts/EventBusContext';
import { AgentConfig, SessionStatus } from '@/app/types';
import { KatoEvents } from '@/app/cases/kato/KatoEvents';

interface UseAgentManagerProps {
  initialAgentConfigs: AgentConfig[];
  sessionStatus: SessionStatus; // Current session status from KatoRTCContext
  addTranscriptBreadcrumb: (message: string) => void;
}

export function useAgentManager({
  initialAgentConfigs,
  sessionStatus,
  addTranscriptBreadcrumb,
}: UseAgentManagerProps) {
  const eventBus = useEventBus();

  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(initialAgentConfigs);
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [currentAgentConfig, setCurrentAgentConfig] = useState<AgentConfig | null>(null);

  // New state for managing transitions
  const [isSwitchingInProgress, setIsSwitchingInProgress] = useState<boolean>(false);
  const [pendingAgentForActivation, setPendingAgentForActivation] = useState<string | null>(null);
  const [playedAgentIntros, setPlayedAgentIntros] = useState<Set<string>>(new Set<string>());
  const [expectingConnectionFor, setExpectingConnectionFor] = useState<string | null>(null);

  useEffect(() => {
    setAgentConfigs(initialAgentConfigs);
  }, [initialAgentConfigs]);

  // --- Internal Orchestration Functions ---

  const _requestConnectionForCurrentAgent = useCallback((agentToConnect: AgentConfig | null) => {
    if (agentToConnect) {
      console.log(`[useAgentManager] Requesting connection for agent: ${agentToConnect.name}`);
      setExpectingConnectionFor(agentToConnect.name);
      eventBus.emit(KatoEvents.USER_REQUESTED_CONNECT);
    } else {
      console.error("[useAgentManager] _requestConnectionForCurrentAgent called with null agentToConnect.");
      setIsSwitchingInProgress(false);
      eventBus.emit(KatoEvents.AGENT_SWITCH_FAILED, {
        agentName: pendingAgentForActivation || selectedAgentName || "unknown",
        success: false,
        error: "Attempted to connect with a null agent config"
      });
      setPendingAgentForActivation(null);
      setExpectingConnectionFor(null);
    }
  }, [eventBus, pendingAgentForActivation, selectedAgentName]);

  const _activateAgentAndHandleIntro = useCallback((agentNameToActivate: string) => {
    const newAgentConfig = agentConfigs.find(a => a.name === agentNameToActivate);

    if (!newAgentConfig) {
      console.error(`[useAgentManager] _activateAgentAndHandleIntro: Agent config not found for ${agentNameToActivate}`);
      setIsSwitchingInProgress(false);
      eventBus.emit(KatoEvents.AGENT_SWITCH_FAILED, { 
        agentName: agentNameToActivate, 
        success: false, 
        error: "Agent config not found during activation" 
      });
      setPendingAgentForActivation(null);
      return;
    }

    console.log(`[useAgentManager] Activating agent state for: ${agentNameToActivate}`);
    const oldAgentName = selectedAgentName;
    setSelectedAgentName(agentNameToActivate);
    setCurrentAgentConfig(newAgentConfig); // This will trigger the "Process Activated Agent Logic" useEffect
    
    eventBus.emit(KatoEvents.CURRENT_AGENT_CHANGED, { 
      newAgentName: agentNameToActivate, 
      oldAgentName: oldAgentName || undefined,
      agentConfig: newAgentConfig 
    });
    // No longer handles intro decision or emits PLAY_AGENT_INTRO_REQUESTED / AGENT_INTRO_PLAYBACK_COMPLETED directly
  }, [agentConfigs, selectedAgentName, eventBus, addTranscriptBreadcrumb]); // Removed playedAgentIntros


  // --- Event Handlers for Agent Selection & Lifecycle ---

  const handleUserSelectedAgent = useCallback((data: { agentName: string }) => {
    const newAgentName = data.agentName;
    if (!newAgentName) {
      console.warn("[useAgentManager] USER_SELECTED_AGENT event with no agentName.");
      return;
    }

    console.log(`[useAgentManager] USER_SELECTED_AGENT: ${newAgentName}. Current: ${selectedAgentName}, Status: ${sessionStatus}, Switching: ${isSwitchingInProgress}`);

    if (isSwitchingInProgress) {
      console.warn(`[useAgentManager] Agent switch already in progress to ${pendingAgentForActivation || selectedAgentName}. Ignoring request for ${newAgentName}.`);
      addTranscriptBreadcrumb("Agent switch already in progress. Please wait.");
      return;
    }

    if (newAgentName === selectedAgentName) {
      if (sessionStatus === "DISCONNECTED" || sessionStatus === "ERROR") {
        addTranscriptBreadcrumb(`Attempting to reconnect with ${newAgentName}...`);
        setIsSwitchingInProgress(true); // Treat reconnect as a form of switch
        eventBus.emit(KatoEvents.AGENT_SWITCH_STARTED, {newAgentName, oldAgentName: selectedAgentName});
        // currentAgentConfig should be the already selected one for newAgentName
        _requestConnectionForCurrentAgent(currentAgentConfig); 
      } else {
        addTranscriptBreadcrumb(`Already selected and interacting with ${newAgentName}.`);
      }
      return;
    }

    // Start a new agent switch
    addTranscriptBreadcrumb(`Switching to agent: ${agentConfigs.find(a => a.name === newAgentName)?.publicDescription || newAgentName}.`);
    setIsSwitchingInProgress(true);
    setPendingAgentForActivation(newAgentName);
    eventBus.emit(KatoEvents.AGENT_SWITCH_STARTED, { newAgentName, oldAgentName: selectedAgentName || undefined });

    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      console.log(`[useAgentManager] Currently connected/connecting. Requesting disconnect before switching to ${newAgentName}.`);
      eventBus.emit(KatoEvents.USER_REQUESTED_DISCONNECT, { isSwitchingAgent: true });
    } else {
      // Already disconnected, can proceed to activate directly
      console.log(`[useAgentManager] Currently disconnected. Activating ${newAgentName} directly.`);
      _activateAgentAndHandleIntro(newAgentName);
    }
  }, [
    selectedAgentName, 
    sessionStatus, 
    isSwitchingInProgress, 
    pendingAgentForActivation, 
    eventBus, 
    addTranscriptBreadcrumb, 
    agentConfigs, 
    _activateAgentAndHandleIntro,
    _requestConnectionForCurrentAgent
  ]);

  useEffect(() => {
    const unsubSelect = eventBus.on(KatoEvents.USER_SELECTED_AGENT, handleUserSelectedAgent);
    return () => unsubSelect();
  }, [eventBus, handleUserSelectedAgent]);

  // Effect to handle post-disconnect logic for agent switching
  useEffect(() => {
    console.log(`[useAgentManager] Session status watcher: ${sessionStatus}, Switching: ${isSwitchingInProgress}, Pending: ${pendingAgentForActivation}, Selected: ${selectedAgentName}`);
    if (
      sessionStatus === "DISCONNECTED" && 
      isSwitchingInProgress && 
      pendingAgentForActivation &&
      selectedAgentName !== pendingAgentForActivation // Prevent re-activation if already set by direct call
    ) {
      console.log(`[useAgentManager] Session Watcher: Disconnected, switch in progress for ${pendingAgentForActivation}. Activating its state.`);
      _activateAgentAndHandleIntro(pendingAgentForActivation);
    }
  }, [sessionStatus, isSwitchingInProgress, pendingAgentForActivation, _activateAgentAndHandleIntro, selectedAgentName]);

  // NEW: Effect to process a newly activated agent (intro or direct connection)
  useEffect(() => {
    if (isSwitchingInProgress && currentAgentConfig && selectedAgentName === currentAgentConfig.name) {
      // We are in a switch, and currentAgentConfig is now set to the selectedAgentName.
      const agentToProcess = currentAgentConfig;
      console.log(`[useAgentManager] Post-Activation Processing: Agent ${agentToProcess.name}.`);

      // Post-Activation Processing: If intro is needed, request it. Otherwise, request connection.
      if (agentToProcess.introAudio?.text && !playedAgentIntros.has(agentToProcess.name)) {
        console.log(`[useAgentManager] Post-Activation Processing: Intro needed for ${agentToProcess.name}. XState machine should handle this.`); // Modified log
        // addTranscriptBreadcrumb(`Playing intro for ${agentToProcess.publicDescription || agentToProcess.name}...`); // useIntroAudio will handle this
        // eventBus.emit(KatoEvents.PLAY_AGENT_INTRO_REQUESTED, { agentConfig: agentToProcess }); // <--- COMMENT OUT
        // Connection will be requested by the AGENT_INTRO_PLAYBACK_COMPLETED handler after intro (which is also now disabled for connection request)
      } else {
        let reason = "";
        if (!agentToProcess.introAudio?.text) {
          reason = "No intro text for agent.";
          console.log(`[useAgentManager] Post-Activation Processing: ${reason} For ${agentToProcess.name}. XState machine should handle connection.`);
        } else { // Implies intro already played
          reason = "Intro already played for agent.";
          console.log(`[useAgentManager] Post-Activation Processing: ${reason} For ${agentToProcess.name}. XState machine should handle connection.`);
        }
        // addTranscriptBreadcrumb(`Connecting with ${agentToProcess.publicDescription || agentToProcess.name}... (${reason})`);
        // _requestConnectionForCurrentAgent(agentToProcess); // <--- COMMENTED OUT TO PREVENT INTERFERENCE
      }
    }
  }, [
    currentAgentConfig,
    selectedAgentName,
    isSwitchingInProgress,
    playedAgentIntros,
    eventBus,
    _requestConnectionForCurrentAgent,
    addTranscriptBreadcrumb 
  ]);

  // Effect to handle intro playback completion (from useIntroAudio)
  useEffect(() => {
    const handleIntroAudioPlaybackCompleted = (data: { agentName: string, playedSuccessfully: boolean, error?: string }) => {
      console.log(`[useAgentManager] AGENT_INTRO_PLAYBACK_COMPLETED (from useIntroAudio) received for ${data.agentName}. Success: ${data.playedSuccessfully}`);
      
      // Ensure this event is for the agent we are currently switching to and whose intro was expected.
      if (isSwitchingInProgress && currentAgentConfig && data.agentName === currentAgentConfig.name) {
        if (data.playedSuccessfully) {
          setPlayedAgentIntros(prev => new Set(prev).add(data.agentName));
        }
        
        // Whether intro played, was skipped by useIntroAudio, or errored, proceed to connect for this agent.
        // currentAgentConfig in this closure will be fresh due to this useEffect's dependency array.
        console.log(`[useAgentManager] Intro playback finished for ${data.agentName}. XState machine should now handle connection.`);
        // _requestConnectionForCurrentAgent(currentAgentConfig); // <--- COMMENTED OUT TO PREVENT INTERFERENCE
      } else {
        console.warn("[useAgentManager] AGENT_INTRO_PLAYBACK_COMPLETED received for an unexpected agent, or switch not in progress, or currentAgentConfig mismatch.", { 
          data, 
          selectedAgentNameFromState: selectedAgentName, 
          currentAgentConfigNameFromState: currentAgentConfig?.name,
          isSwitchingInProgressFromState: isSwitchingInProgress 
        });
      }
    };
    const unsubIntro = eventBus.on(KatoEvents.AGENT_INTRO_PLAYBACK_COMPLETED, handleIntroAudioPlaybackCompleted);
    return () => unsubIntro();
  }, [
      eventBus, 
      isSwitchingInProgress, 
      selectedAgentName, // To help in logging/debugging conditions if needed
      currentAgentConfig, // Ensures currentAgentConfig is fresh in the handler
      _requestConnectionForCurrentAgent,
      addTranscriptBreadcrumb // If breadcrumbs are needed here
    ]);
  
  // Effect to finalize agent switch (success or failure)
  useEffect(() => {
    if (!isSwitchingInProgress) {
        return;
    }

    const agentNameForFailure = pendingAgentForActivation || selectedAgentName;

    if (sessionStatus === "CONNECTED" && currentAgentConfig && selectedAgentName === currentAgentConfig.name) {
        if (pendingAgentForActivation === null || selectedAgentName === pendingAgentForActivation) {
             console.log(`[useAgentManager] Finalize(Success): Switch to ${selectedAgentName} successful (CONNECTED). Pending was: ${pendingAgentForActivation}`);
             addTranscriptBreadcrumb(`Successfully connected with ${currentAgentConfig.publicDescription || selectedAgentName}.`);
             setIsSwitchingInProgress(false);
             setPendingAgentForActivation(null);
             setExpectingConnectionFor(null);
             eventBus.emit(KatoEvents.AGENT_SWITCH_COMPLETED, { agentName: selectedAgentName, success: true });
        } else {
            console.warn(`[useAgentManager] Finalize(Warning): Connected to ${selectedAgentName}, but pending was ${pendingAgentForActivation}. Treating as success for ${selectedAgentName}.`);
            setIsSwitchingInProgress(false);
            setPendingAgentForActivation(null); 
            setExpectingConnectionFor(null);
            eventBus.emit(KatoEvents.AGENT_SWITCH_COMPLETED, { agentName: selectedAgentName, success: true });
        }
    } else if (sessionStatus === "ERROR") {
        console.warn(`[useAgentManager] Finalize(Failure): Switch to ${agentNameForFailure} failed (ERROR status).`);
        addTranscriptBreadcrumb(`Failed to connect with ${agentNameForFailure} (Error).`);
        setIsSwitchingInProgress(false);
        eventBus.emit(KatoEvents.AGENT_SWITCH_FAILED, {
            agentName: agentNameForFailure,
            success: false,
            error: `Session status became ERROR`
        });
        setPendingAgentForActivation(null);
        setExpectingConnectionFor(null);
    } else if (sessionStatus === "DISCONNECTED") {
        if (isSwitchingInProgress && expectingConnectionFor && selectedAgentName === expectingConnectionFor) {
            console.warn(`[useAgentManager] Finalize(Failure): Connection attempt for ${selectedAgentName} resulted in DISCONNECTED.`);
            addTranscriptBreadcrumb(`Failed to connect with ${selectedAgentName} (Disconnected after attempt).`);
            setIsSwitchingInProgress(false);
            eventBus.emit(KatoEvents.AGENT_SWITCH_FAILED, {
                agentName: selectedAgentName,
                success: false,
                error: `Connection attempt for ${selectedAgentName} resulted in DISCONNECTED`
            });
            setPendingAgentForActivation(null);
            setExpectingConnectionFor(null);
        } 
    }
  }, [sessionStatus, currentAgentConfig, selectedAgentName, isSwitchingInProgress, pendingAgentForActivation, eventBus, addTranscriptBreadcrumb, expectingConnectionFor]);


  // Derived patient and preceptor agents (no changes needed here)
  const patientAgent = useMemo(() => agentConfigs.find(a => a.name === "mrKato"), [agentConfigs]);
  const preceptorAgent = useMemo(() => agentConfigs.find(a => a.name === "preceptor"), [agentConfigs]);

  return {
    agentConfigs,
    selectedAgentName,
    currentAgentConfig,
    patientAgent,
    preceptorAgent,
    // Expose new state for UI if needed, e.g., isSwitchingInProgress
    isSwitchingInProgress,
  };
} 
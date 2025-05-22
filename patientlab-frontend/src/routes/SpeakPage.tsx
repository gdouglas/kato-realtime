import React from 'react';
import { Button } from "@/components/ui/button"
export default function SpeakPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">Speak Mode!</h1>
      {/* TODO: Avatar, AgentSwitcher, MicActivityIndicator, TurnIndicator, TranscriptExporter */}
      <div className="flex flex-col items-center justify-center min-h-svh">
      <Button variant="outline">Click me</Button>
    </div>
    </div>
  );
}
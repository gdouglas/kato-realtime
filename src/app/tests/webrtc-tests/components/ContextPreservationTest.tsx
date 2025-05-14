'use client';

import { useState } from 'react';
import { testContextPreservation } from '../lib/contextPreservationTest';

interface TestProps {
  onLog: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  onTestComplete: (result: any) => void;
  isAnyTestRunning: boolean;
}

export default function ContextPreservationTest({ onLog, onTestComplete, isAnyTestRunning }: TestProps) {
  const [isRunning, setIsRunning] = useState(false);
  
  const runTest = async () => {
    try {
      setIsRunning(true);
      onLog(`Starting Context Preservation Test`, 'info');
      
      const results = await Promise.resolve(testContextPreservation());
      
      // For context preservation, success is determined by whether we got valid data structure
      const success = results && 
        results.basicContext && 
        results.agentAwareContext && 
        results.roleBasedContext;
      
      onLog(`Context Preservation Test completed. ${success ? '✓ SUCCESS' : '✗ FAILED'}`, success ? 'success' : 'error');
      
      onTestComplete({
        name: 'Context Preservation Test',
        status: success ? 'success' : 'failure',
        message: `${success ? 'SUCCESS' : 'FAILED'}: Tests if conversation context is properly maintained during reconnection`,
        details: results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      onLog(`Context Preservation Test failed with error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      onTestComplete({
        name: 'Context Preservation Test',
        status: 'failure',
        message: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      setIsRunning(false);
    }
  };

  const testInfo = {
    id: 'context-preservation',
    name: 'Context Preservation Test',
    description: 'Tests if conversation context is properly maintained during reconnection',
    color: 'orange'
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="font-medium text-lg mb-1">{testInfo.name}</h3>
      <p className="text-sm text-gray-600 mb-3">{testInfo.description}</p>
      <button
        onClick={runTest}
        disabled={isRunning || isAnyTestRunning}
        className={`px-4 py-2 rounded text-white font-medium transition-colors ${
          isRunning ? 'bg-gray-400' : `bg-${testInfo.color}-500 hover:bg-${testInfo.color}-600`
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isRunning ? 'Running...' : `Run ${testInfo.name}`}
      </button>
    </div>
  );
} 
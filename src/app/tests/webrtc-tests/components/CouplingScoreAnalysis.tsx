'use client';

import { useState } from 'react';
import { calculateCouplingScore } from '../lib/webrtcCouplingAnalysis';

interface TestProps {
  onLog: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  onTestComplete: (result: any) => void;
  isAnyTestRunning: boolean;
}

export default function CouplingScoreAnalysis({ onLog, onTestComplete, isAnyTestRunning }: TestProps) {
  const [isRunning, setIsRunning] = useState(false);
  
  const runTest = async () => {
    try {
      setIsRunning(true);
      onLog(`Starting Coupling Score Analysis`, 'info');
      
      const results = await Promise.resolve(calculateCouplingScore());
      
      // For this test, success is determined by whether we got a valid score
      const success = typeof results?.score === 'number';
      
      onLog(`Coupling Score Analysis completed. ${success ? '✓ SUCCESS' : '✗ FAILED'}`, success ? 'success' : 'error');
      
      onTestComplete({
        name: 'Coupling Score Analysis',
        status: success ? 'success' : 'failure',
        message: `${success ? 'SUCCESS' : 'FAILED'}: Calculates a numeric score for the WebRTC implementation's coupling`,
        details: results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      onLog(`Coupling Score Analysis failed with error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      onTestComplete({
        name: 'Coupling Score Analysis',
        status: 'failure',
        message: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      setIsRunning(false);
    }
  };

  const testInfo = {
    id: 'coupling-score',
    name: 'Coupling Score Analysis',
    description: 'Calculates a numeric score for the WebRTC implementation\'s coupling',
    color: 'green'
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
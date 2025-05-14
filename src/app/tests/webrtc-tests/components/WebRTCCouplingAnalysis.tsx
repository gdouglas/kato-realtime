'use client';

import { useState } from 'react';
import { analyzeWebRTCCoupling } from '../lib/webrtcCouplingAnalysis';

interface TestProps {
  onLog: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  onTestComplete: (result: any) => void;
  isAnyTestRunning: boolean;
}

export default function WebRTCCouplingAnalysis({ onLog, onTestComplete, isAnyTestRunning }: TestProps) {
  const [isRunning, setIsRunning] = useState(false);
  
  const runTest = async () => {
    try {
      setIsRunning(true);
      onLog(`Starting WebRTC Coupling Analysis`, 'info');
      
      const results = await Promise.resolve(analyzeWebRTCCoupling());
      
      // For coupling analysis, success is determined by whether the test ran without errors
      // and returned meaningful data
      const success = results && Object.keys(results).length > 0;
      
      onLog(`WebRTC Coupling Analysis completed. ${success ? '✓ SUCCESS' : '✗ FAILED'}`, success ? 'success' : 'error');
      
      onTestComplete({
        name: 'WebRTC Coupling Analysis',
        status: success ? 'success' : 'failure',
        message: `${success ? 'SUCCESS' : 'FAILED'}: Analyzes the coupling between WebRTC implementation and application code`,
        details: results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      onLog(`WebRTC Coupling Analysis failed with error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      onTestComplete({
        name: 'WebRTC Coupling Analysis',
        status: 'failure',
        message: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      setIsRunning(false);
    }
  };

  const testInfo = {
    id: 'webrtc-coupling',
    name: 'WebRTC Coupling Analysis',
    description: 'Analyzes the coupling between WebRTC implementation and application code',
    color: 'purple'
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
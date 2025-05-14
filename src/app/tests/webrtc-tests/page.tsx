'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReconnectionTest from './components/ReconnectionTest';
import WebRTCCouplingAnalysis from './components/WebRTCCouplingAnalysis';
import ContextPreservationTest from './components/ContextPreservationTest';
import CouplingScoreAnalysis from './components/CouplingScoreAnalysis';

interface TestResult {
  name: string;
  status: 'success' | 'failure' | 'running' | 'idle';
  message: string;
  details?: any;
  timestamp?: string;
}

export default function WebRTCTestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Add a log entry
  const addLog = (message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌ ERROR: ' :
                   level === 'warning' ? '⚠️ WARNING: ' :
                   level === 'success' ? '✅ SUCCESS: ' : 'ℹ️ INFO: ';
    
    const formattedMessage = `[${timestamp}] ${prefix}${message}`;
    setLogs(prev => [formattedMessage, ...prev]);
    console.log(message);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared', 'info');
  };

  // Clear test results
  const clearTestResults = () => {
    setTestResults([]);
    addLog('Test results cleared', 'info');
  };

  // Copy content to clipboard
  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => {
        addLog('Content copied to clipboard', 'success');
      })
      .catch(err => {
        addLog(`Failed to copy: ${err}`, 'error');
      });
  };

  // Copy test results
  const copyTestResults = () => {
    const content = testResults.map(result => 
      `[${result.name}] ${result.status.toUpperCase()}: ${result.message}${result.timestamp ? `\nTimestamp: ${result.timestamp}` : ''}${result.details ? `\nDetails: ${JSON.stringify(result.details, null, 2)}` : ''}`
    ).join('\n\n');
    
    copyToClipboard(content || 'No test results available');
  };

  // Copy logs
  const copyLogs = () => {
    copyToClipboard(logs.join('\n') || 'No logs available');
  };

  // Handle test completion
  const handleTestComplete = (result: TestResult) => {
    setTestResults(prev => [
      result,
      ...prev.filter(r => r.name !== result.name)
    ]);
    setIsRunning(false);
  };

  // Start test run
  const handleTestStart = () => {
    setIsRunning(true);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-2">
        <Link href="/tests" className="text-blue-600 hover:underline inline-flex items-center">
          &larr; Back to Tests
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold mb-4">WebRTC Implementation Tests</h1>
      <p className="mb-6 text-gray-600">
        These tests validate the WebRTC implementation used for voice switching and context preservation
        in the medical education simulation. All tests use the server API automatically - no manual key input is required.
      </p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Test Buttons */}
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-medium">Available Tests</h2>
            </div>
            <div className="p-4 grid gap-4">
              <ReconnectionTest 
                onLog={addLog} 
                onTestComplete={handleTestComplete} 
                isAnyTestRunning={isRunning} 
              />
              
              <WebRTCCouplingAnalysis 
                onLog={addLog} 
                onTestComplete={handleTestComplete} 
                isAnyTestRunning={isRunning} 
              />
              
              <ContextPreservationTest 
                onLog={addLog} 
                onTestComplete={handleTestComplete} 
                isAnyTestRunning={isRunning} 
              />
              
              <CouplingScoreAnalysis 
                onLog={addLog} 
                onTestComplete={handleTestComplete} 
                isAnyTestRunning={isRunning} 
              />
            </div>
          </div>
          
          {/* Test Results */}
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium">Test Results</h2>
              <div className="flex space-x-2">
                <button
                  onClick={copyTestResults}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  Copy
                </button>
                <button
                  onClick={clearTestResults}
                  className="text-sm text-gray-600 hover:text-red-500"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="p-4">
              {testResults.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  No tests have been run yet. Click one of the buttons above to start a test.
                </div>
              ) : (
                <div className="space-y-4">
                  {testResults.map((result, index) => (
                    <div 
                      key={index} 
                      className={`border rounded-lg p-4 ${
                        result.status === 'success' ? 'border-green-200 bg-green-50' :
                        result.status === 'failure' ? 'border-red-200 bg-red-50' :
                        result.status === 'running' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-medium">{result.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'success' ? 'bg-green-100 text-green-800' :
                          result.status === 'failure' ? 'bg-red-100 text-red-800' :
                          result.status === 'running' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {result.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{result.message}</p>
                      
                      {result.timestamp && (
                        <p className="text-xs text-gray-500">
                          {new Date(result.timestamp).toLocaleString()}
                        </p>
                      )}
                      
                      {result.details && (
                        <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono overflow-x-auto">
                          <pre>{JSON.stringify(result.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Logs Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-md rounded-lg overflow-hidden h-full">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium">Test Logs</h2>
              <div className="flex space-x-2">
                <button
                  onClick={copyLogs}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  Copy
                </button>
                <button
                  onClick={clearLogs}
                  className="text-sm text-gray-600 hover:text-red-500"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="bg-gray-900 text-gray-100 p-2 h-[800px] overflow-y-auto font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-500 italic p-2">No logs yet</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="px-2 py-1 border-b border-gray-800 whitespace-pre-wrap">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
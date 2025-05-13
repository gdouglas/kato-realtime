"use client";
import { useState } from 'react';
import { testReconnection } from '../lib/spikes/reconnectionTest';
import { analyzeWebRTCCoupling, calculateCouplingScore } from '../lib/spikes/webrtcCouplingAnalysis';
import { testContextPreservation } from '../lib/spikes/contextPreservationTest';

export default function TestRunner() {
  const [testResults, setTestResults] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  const runTest = async (testFn: () => any, name: string) => {
    try {
      setIsRunning(true);
      setActiveTest(name);
      setTestResults(`Running ${name}...`);
      setTestSuccess(null);
      
      console.clear();
      console.log(`Starting ${name}...`);
      
      // Ensure we have a Promise by wrapping with Promise.resolve
      const results = await Promise.resolve(testFn());
      console.log(`${name} results:`, results);
      
      // Check if the test has a success property
      const success = typeof results?.success === 'boolean' ? results.success : true;
      setTestSuccess(success);
      
      setTestResults(`${name} completed. ${success ? '✓ SUCCESS' : '✗ FAILED'}`);
    } catch (error) {
      console.error(`${name} error:`, error);
      setTestResults(`${name} failed with error: ${error instanceof Error ? error.message : String(error)}`);
      setTestSuccess(false);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 1000,
      backgroundColor: '#f8f9fa',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      width: '300px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ 
        marginBottom: '12px', 
        fontWeight: 'bold',
        fontSize: '16px',
        borderBottom: '1px solid #e1e4e8',
        paddingBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Phase 0: Spike Tests</span>
        {isRunning && (
          <span style={{ 
            display: 'inline-block',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#3498db',
            animation: 'spin 1s linear infinite'
          }}></span>
        )}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          onClick={() => runTest(testReconnection, 'Reconnection Test')}
          disabled={isRunning}
          style={{ 
            padding: '8px 12px', 
            backgroundColor: activeTest === 'Reconnection Test' 
              ? (testSuccess === null ? '#3498db' : testSuccess ? '#2ecc71' : '#e74c3c')
              : '#3498db', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            fontWeight: 'medium',
            fontSize: '14px'
          }}
        >
          {activeTest === 'Reconnection Test' && isRunning ? 'Running...' : 'Run Reconnection Test'}
        </button>
        
        <button 
          onClick={() => runTest(analyzeWebRTCCoupling, 'WebRTC Coupling Analysis')}
          disabled={isRunning}
          style={{ 
            padding: '8px 12px', 
            backgroundColor: activeTest === 'WebRTC Coupling Analysis' 
              ? (testSuccess === null ? '#9b59b6' : testSuccess ? '#2ecc71' : '#e74c3c')
              : '#9b59b6', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            fontWeight: 'medium',
            fontSize: '14px'
          }}
        >
          {activeTest === 'WebRTC Coupling Analysis' && isRunning ? 'Running...' : 'Run WebRTC Analysis'}
        </button>
        
        <button 
          onClick={() => runTest(testContextPreservation, 'Context Preservation Test')}
          disabled={isRunning}
          style={{ 
            padding: '8px 12px', 
            backgroundColor: activeTest === 'Context Preservation Test' 
              ? (testSuccess === null ? '#e67e22' : testSuccess ? '#2ecc71' : '#e74c3c')
              : '#e67e22', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            fontWeight: 'medium',
            fontSize: '14px'
          }}
        >
          {activeTest === 'Context Preservation Test' && isRunning ? 'Running...' : 'Run Context Preservation Test'}
        </button>
        
        <button 
          onClick={() => runTest(calculateCouplingScore, 'Coupling Score Analysis')}
          disabled={isRunning}
          style={{ 
            padding: '8px 12px', 
            backgroundColor: activeTest === 'Coupling Score Analysis' 
              ? (testSuccess === null ? '#1abc9c' : testSuccess ? '#2ecc71' : '#e74c3c')
              : '#1abc9c', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            fontWeight: 'medium',
            fontSize: '14px'
          }}
        >
          {activeTest === 'Coupling Score Analysis' && isRunning ? 'Running...' : 'Calculate Coupling Score'}
        </button>
      </div>
      
      {testResults && (
        <div style={{ 
          marginTop: '12px', 
          padding: '8px', 
          backgroundColor: testSuccess === true ? '#e8f7f0' : 
                           testSuccess === false ? '#fceaea' : 
                           '#f1f8fe',
          borderRadius: '4px',
          fontSize: '14px',
          border: `1px solid ${
            testSuccess === true ? '#c3e6d1' : 
            testSuccess === false ? '#f5d0d0' : 
            '#d1e6f3'
          }`
        }}>
          {testResults}
        </div>
      )}
      
      <div style={{ 
        marginTop: '10px', 
        fontSize: '12px', 
        color: '#666',
        textAlign: 'center' 
      }}>
        Open console (F12) to see detailed test results
      </div>
    </div>
  );
}

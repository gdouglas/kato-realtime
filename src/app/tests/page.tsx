'use client';

import Link from 'next/link';
import { FC } from 'react';

// Available tests for the reconnection logic
const testPages = [
  {
    name: 'WebRTC Implementation Tests',
    description: 'Run automated tests to validate WebRTC implementation, voice switching, and context preservation',
    path: '/tests/webrtc-tests'
  },
  {
    name: 'Voice Switching Test',
    description: 'Test switching between Preceptor (Shimmer) and Patient (Ash) voices',
    path: '/tests/voice-switching'
  },
  {
    name: 'Context Preservation Test',
    description: 'Test different strategies for preserving conversation context during voice switching',
    path: '/tests/context-preservation'
  },
  {
    name: 'Reconnection Performance Test',
    description: 'Measure reconnection performance and verify it meets the 2-second target',
    path: '/tests/reconnection-performance'
  }
];

const TestIndexPage: FC = () => {
  return (
    <div className="container mx-auto p-8">
      <div className="mb-2">
        <Link href="/" className="text-blue-600 hover:underline inline-flex items-center">
          &larr; Back to App
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Voice Switching Tests</h1>
        <p className="text-gray-600">
          These tests validate the WebRTC reconnection approach for switching voices between
          Preceptor (Shimmer) and Patient (Ash) in the medical education simulation.
        </p>
      </div>

      <div className="grid gap-6">
        {testPages.map((test) => (
          <div 
            key={test.path} 
            className={`border rounded-lg p-6 hover:shadow-md transition ${
              test.path === '/tests/webrtc-tests' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
            }`}
          >
            <h2 className="text-xl font-semibold mb-2">{test.name}</h2>
            <p className="text-gray-600 mb-4">{test.description}</p>
            <Link 
              href={test.path}
              className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                test.path === '/tests/webrtc-tests' 
                ? 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-700/20 hover:bg-blue-200' 
                : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 hover:bg-blue-100'
              }`}
            >
              Run Test
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TestIndexPage; 
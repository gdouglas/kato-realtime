'use client';

import React from 'react';
import Link from 'next/link';

const ReconnectionPerformanceTest = () => {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Reconnection Performance Test</h1>
      <p className="mb-6">
        This test measures the performance of the reconnection process and verifies
        that it meets the 2-second target for voice switching.
      </p>
      
      <div className="p-8 border border-yellow-200 bg-yellow-50 rounded-lg mb-8">
        <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
        <p className="mb-4">
          This test is under development and will be available soon.
        </p>
        <Link href="/tests" className="text-blue-600 hover:underline">
          &larr; Back to Tests
        </Link>
      </div>
    </div>
  );
};

export default ReconnectionPerformanceTest; 
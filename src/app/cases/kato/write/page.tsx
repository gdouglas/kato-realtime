"use client";

import React from 'react';
import Link from 'next/link';
import { useTranscript } from '@/app/contexts/TranscriptContext';
import { TranscriptItem } from '@/app/types';

const WritePage = () => {
  const { transcriptItems } = useTranscript();

  const messages = transcriptItems.filter(
    (item): item is TranscriptItem & { type: 'MESSAGE' } => item.type === 'MESSAGE' && !item.isHidden
  );

  return (
    <div className="p-4 h-full flex flex-col">
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
    </div>
  );
};

export default WritePage;

import React, { useState, useEffect } from 'react';
import { getAgentConversationTokenCounts } from '@/app/lib/tokenCounter';

const TokenCountDisplay = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tokenCounts, setTokenCounts] = useState<Record<string, { messages: number, tokens: number }>>({});

  // Update token counts when the component is opened
  useEffect(() => {
    if (isOpen) {
      setTokenCounts(getAgentConversationTokenCounts());
    }
  }, [isOpen]);

  // Only render the button if not open, otherwise render the full display
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-4 z-50 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
      >
        Token Stats
      </button>
    );
  }

  // Calculate total tokens across all agents
  const totalTokens = Object.values(tokenCounts).reduce(
    (sum, data) => sum + data.tokens, 0
  );

  return (
    <div className="fixed top-16 right-4 w-64 z-50 bg-white shadow-lg rounded-md p-3 border border-gray-200">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-sm text-gray-900">Conversation Token Counts</h3>
        <button 
          onClick={() => setIsOpen(false)} 
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
      
      <div className="text-xs text-gray-900">
        {Object.keys(tokenCounts).length > 0 ? (
          <div>
            {Object.entries(tokenCounts).map(([agentName, data]) => (
              <div key={agentName} className="mb-1 p-1 rounded bg-gray-50">
                <div className="flex justify-between">
                  <span className="font-semibold">{agentName}:</span>
                  <span>{data.tokens} tokens</span>
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-[10px]">
                  {data.messages} messages
                </div>
              </div>
            ))}
            
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold">
              <span>Total Tokens:</span>
              <span>{totalTokens}</span>
            </div>
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400 italic">
            No agent conversations found
          </div>
        )}
        
        <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
          Note: Token counts are approximate estimations
        </div>
      </div>
      
      <button 
        onClick={() => {
          setTokenCounts(getAgentConversationTokenCounts());
        }}
        className="mt-2 w-full text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
      >
        Refresh Counts
      </button>
    </div>
  );
};

export default TokenCountDisplay; 
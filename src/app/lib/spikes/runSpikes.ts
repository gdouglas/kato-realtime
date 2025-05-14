/**
 * Spike Test Runner
 * 
 * This is a helper script to run all the spike tests for the reconnection logic.
 * You can run one or all spike tests from the command line.
 * 
 * Usage:
 *   npm run spike -- --test=all
 *   npm run spike -- --test=browser
 *   npm run spike -- --test=reconnection
 *   npm run spike -- --test=agent
 *   npm run spike -- --test=functional
 */

import { runReconnectionPerformanceTests } from './reconnectionPerformanceTest';
import { runAgentTransferTest } from './agentTransferTest';
import { runFunctionalReconnectionTest } from './functionalReconnectionTest';

// Default settings
const DEFAULT_TEST = 'all';

// Parse command line arguments
function parseArgs(): { test: string; ephemeralKey: string } {
  const args = process.argv.slice(2);
  let test = DEFAULT_TEST;
  let ephemeralKey = process.env.OPENAI_API_KEY || '';
  
  for (const arg of args) {
    if (arg.startsWith('--test=')) {
      test = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--key=')) {
      ephemeralKey = arg.split('=')[1];
    }
  }
  
  return { test, ephemeralKey };
}

// Run the specified spike test
async function runTest(test: string, ephemeralKey: string): Promise<void> {
  console.log(`\n=========================================`);
  console.log(`Running test: ${test.toUpperCase()}`);
  console.log(`=========================================\n`);
  
  try {
    switch (test) {

      case 'reconnection':
        await runReconnectionPerformanceTests(ephemeralKey);
        break;
        
      case 'agent':
        await runAgentTransferTest(ephemeralKey);
        break;
        
      case 'functional':
        await runFunctionalReconnectionTest(ephemeralKey);
        break;
        
      case 'all':
        console.log('Running all spike tests in sequence...\n');
        
        console.log('\n--- RECONNECTION PERFORMANCE TEST ---\n');
        await runReconnectionPerformanceTests(ephemeralKey);
        
        console.log('\n--- AGENT TRANSFER TEST ---\n');
        await runAgentTransferTest(ephemeralKey);
        
        console.log('\n--- FUNCTIONAL RECONNECTION TEST ---\n');
        await runFunctionalReconnectionTest(ephemeralKey);
        break;
        
      default:
        console.error(`Unknown test: ${test}`);
        showHelp();
        break;
    }
  } catch (error) {
    console.error(`Error running test '${test}':`, error);
  }
}

// Show help text
function showHelp(): void {
  console.log(`
Usage:
  npm run spike -- --test=<testName> [--key=<ephemeralKey>]

Available tests:
  browser     - Browser compatibility test
  reconnection - Reconnection performance test
  agent       - Agent transfer test
  functional  - End-to-end functional test
  all         - Run all tests (default)

Environment:
  The OPENAI_API_KEY environment variable will be used if --key is not provided.
  `);
}

// Main function
async function main(): Promise<void> {
  const { test, ephemeralKey } = parseArgs();
  
  if (!ephemeralKey) {
    console.error('Error: No OpenAI API key provided. Set OPENAI_API_KEY environment variable or use --key=<ephemeralKey>');
    showHelp();
    process.exit(1);
  }
  
  await runTest(test, ephemeralKey);
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

// Export for use in other scripts
export { runTest }; 
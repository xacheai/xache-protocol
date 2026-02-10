/**
 * Example: Using MemoryExtractor with Local Ollama (Zero Cost, Privacy-First)
 */

import { MemoryExtractor, OllamaAdapter } from '../src';
import { XacheClient } from '@xache/sdk';

async function main() {
  console.log('===== LOCAL MEMORY EXTRACTION WITH OLLAMA =====\n');
  console.log('Benefits:');
  console.log('  ✓ Zero API costs (runs locally)');
  console.log('  ✓ Privacy-first (traces never leave your machine)');
  console.log('  ✓ No API keys needed\n');
  console.log('Prerequisites:');
  console.log('  1. Install Ollama: https://ollama.com/');
  console.log('  2. Pull a model: ollama pull llama3.1:70b');
  console.log('  3. Start Ollama server (usually runs automatically)\n');

  // Create extractor with Ollama adapter (local model)
  const extractor = new MemoryExtractor({
    llm: new OllamaAdapter({
      model: 'llama3.1:70b', // or llama3.3, mistral, qwen2.5:72b, etc.
      baseUrl: 'http://localhost:11434',
    }),
    debug: true,
    confidenceThreshold: 0.7,
  });

  // Sample coding assistant trace
  const trace = `
User asked me to optimize a slow database query.

ATTEMPT 1: Added WHERE clause to filter results
- Before: 2400ms
- After: 2350ms
- Result: Only 2% improvement, not worth it

ATTEMPT 2: Added index on user_id column
- Before: 2400ms
- After: 150ms
- Result: 94% improvement! User was very happy

User also mentioned they prefer detailed explanations with metrics.
  `.trim();

  console.log('===== EXTRACTING MEMORIES FROM TRACE =====\n');

  // Extract memories
  const extractions = await extractor.extract({
    trace,
    agentContext: 'code-assistant',
  });

  console.log(`\nFound ${extractions.length} learnings:\n`);

  // Display extractions
  for (const ex of extractions) {
    console.log('─'.repeat(50));
    console.log(`Type: ${ex.type}`);
    console.log(`Confidence: ${(ex.confidence * 100).toFixed(1)}%`);
    console.log(`Method: client.memory.${ex.suggestedMethod}()`);
    console.log(`Data:`, JSON.stringify(ex.data, null, 2));
    console.log(`Reasoning: ${ex.reasoning}`);
    console.log('');
  }

  // Store learnings
  if (process.env.XACHE_DID && process.env.XACHE_PRIVATE_KEY) {
    console.log('===== STORING LEARNINGS =====\n');

    const client = new XacheClient({
      apiUrl: 'https://xache-api-gateway-prod.hari-sadasivan.workers.dev',
      did: process.env.XACHE_DID,
      privateKey: process.env.XACHE_PRIVATE_KEY,
    });

    for (const ex of extractions) {
      if (ex.confidence >= 0.8) {
        console.log(`Storing: ${ex.type}`);
        const storageKey = await (client.memory as any)[ex.suggestedMethod](ex.data);
        console.log(`  ✓ Stored: ${storageKey}\n`);
      }
    }
  }

  console.log('\n💡 This extraction ran entirely on your machine!');
  console.log('   No API costs, no data sent to external servers.\n');
}

main().catch(console.error);

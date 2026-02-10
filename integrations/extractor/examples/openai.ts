/**
 * Example: Using MemoryExtractor with OpenAI GPT
 */

import { MemoryExtractor, OpenAIAdapter } from '../src';
import { XacheClient } from '@xache/sdk';

async function main() {
  console.log('===== MEMORY EXTRACTION WITH OPENAI GPT =====\n');

  // Create extractor with OpenAI adapter
  const extractor = new MemoryExtractor({
    llm: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4-turbo', // or 'gpt-4', 'gpt-3.5-turbo'
    }),
    debug: true,
    confidenceThreshold: 0.7,
  });

  // Sample code assistant trace
  const trace = `
User: Can you optimize this slow database query?
Agent: Let me analyze the query...

ATTEMPT 1: Added WHERE clause
- Execution time before: 2400ms
- Execution time after: 2350ms
- Result: Only 2% improvement

ATTEMPT 2: Added index on user_id column
- Execution time before: 2400ms
- Execution time after: 150ms
- Result: 94% improvement!

User: Great! Also, I prefer seeing detailed metrics like this
Agent: Noted - I'll include detailed performance metrics in future responses
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

  // Store high-confidence learnings
  if (process.env.XACHE_DID && process.env.XACHE_PRIVATE_KEY) {
    console.log('===== STORING LEARNINGS =====\n');

    const client = new XacheClient({
      apiUrl: 'https://xache-api-gateway-prod.hari-sadasivan.workers.dev',
      did: process.env.XACHE_DID,
      privateKey: process.env.XACHE_PRIVATE_KEY,
    });

    for (const ex of extractions) {
      if (ex.confidence >= 0.8) {
        console.log(`Storing: ${ex.type} (confidence: ${ex.confidence})`);
        const storageKey = await (client.memory as any)[ex.suggestedMethod](ex.data);
        console.log(`  ✓ Stored: ${storageKey}\n`);
      } else {
        console.log(`Skipping: ${ex.type} (confidence too low: ${ex.confidence})\n`);
      }
    }
  } else {
    console.log('💡 Set XACHE_DID and XACHE_PRIVATE_KEY to store learnings\n');
  }

  console.log('\n💡 Cost Optimization Tips:');
  console.log('   - Use gpt-3.5-turbo for cheaper extraction (~10x less cost)');
  console.log('   - Use gpt-4-turbo for better quality extraction');
  console.log('   - Consider Ollama for zero-cost local extraction\n');
}

main().catch(console.error);

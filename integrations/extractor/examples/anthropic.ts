/**
 * Example: Using MemoryExtractor with Anthropic Claude
 */

import { MemoryExtractor, AnthropicAdapter } from '../src';
import { XacheClient } from '@xache/sdk';

async function main() {
  // Create extractor with Anthropic adapter
  const extractor = new MemoryExtractor({
    llm: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-20241022',
    }),
    debug: true,
    confidenceThreshold: 0.7,
  });

  // Sample agent execution trace
  const trace = `
[2025-01-15 10:23:45] User: I need help with order #12345
[2025-01-15 10:23:47] Agent: Let me check your order... Found it!
[2025-01-15 10:23:50] Agent: I see the payment was declined
[2025-01-15 10:23:52] User: Can you retry the payment?
[2025-01-15 10:23:55] Agent: I retried the payment successfully
[2025-01-15 10:23:58] User: Thanks! Also, please keep responses brief
[2025-01-15 10:24:00] Agent: Will do. Anything else I can help with?
[2025-01-15 10:24:02] User: No, that's all
  `.trim();

  console.log('===== EXTRACTING MEMORIES FROM TRACE =====\n');

  // Extract memories
  const extractions = await extractor.extract({
    trace,
    agentContext: 'customer-service',
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
}

main().catch(console.error);

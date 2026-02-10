/**
 * Example: Using MemoryExtractor with Custom LLM Function
 */

import { MemoryExtractor } from '../src';
import { XacheClient } from '@xache/sdk';

async function main() {
  console.log('===== CUSTOM LLM FUNCTION =====\n');
  console.log('This example shows how to use ANY LLM provider');
  console.log('without needing a pre-built adapter.\n');

  // Create extractor with custom LLM function
  const extractor = new MemoryExtractor({
    llm: async (prompt: string) => {
      // You can use ANY LLM here:
      // - Your own fine-tuned model
      // - A proprietary company model
      // - A custom API endpoint
      // - A different provider (Cohere, Mistral, etc.)

      console.log('[Custom LLM] Received prompt (length:', prompt.length, 'chars)');

      // Example: Mock LLM response (replace with your actual LLM call)
      // In production, you'd call your actual LLM API here:
      //
      // const response = await fetch('https://my-llm-api.com/complete', {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${MY_API_KEY}` },
      //   body: JSON.stringify({ prompt })
      // });
      // return (await response.json()).text;

      // For this example, return a mock response
      return JSON.stringify([
        {
          type: 'xache.user.preference',
          confidence: 0.95,
          data: {
            key: 'responseFormat',
            value: 'detailed-with-examples',
            timestamp: Date.now(),
          },
          reasoning: 'User explicitly stated preference for detailed responses with examples',
          evidence: 'User said: "I prefer detailed explanations with code examples"',
        },
      ]);
    },
    debug: true,
  });

  const trace = `
User: I prefer detailed explanations with code examples
Agent: Understood, I'll provide detailed responses with code examples
  `.trim();

  console.log('===== EXTRACTING MEMORIES =====\n');

  const extractions = await extractor.extract({
    trace,
    agentContext: 'general',
  });

  console.log(`\nFound ${extractions.length} learnings:\n`);

  for (const ex of extractions) {
    console.log('─'.repeat(50));
    console.log(`Type: ${ex.type}`);
    console.log(`Confidence: ${(ex.confidence * 100).toFixed(1)}%`);
    console.log(`Method: client.memory.${ex.suggestedMethod}()`);
    console.log(`Data:`, JSON.stringify(ex.data, null, 2));
    console.log('');
  }

  console.log('\n💡 Integration Examples:\n');
  console.log('// Cohere');
  console.log('llm: async (prompt) => {');
  console.log('  const response = await cohere.generate({ prompt, model: "command" });');
  console.log('  return response.generations[0].text;');
  console.log('}\n');

  console.log('// Mistral AI');
  console.log('llm: async (prompt) => {');
  console.log('  const response = await mistral.chat({ messages: [{ role: "user", content: prompt }] });');
  console.log('  return response.choices[0].message.content;');
  console.log('}\n');

  console.log('// Custom Fine-Tuned Model');
  console.log('llm: async (prompt) => {');
  console.log('  const response = await myModel.complete(prompt);');
  console.log('  return response.text;');
  console.log('}\n');
}

main().catch(console.error);

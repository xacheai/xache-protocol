# @xache/extractor

**LLM-agnostic memory extraction for Xache Protocol**

Analyze agent execution traces and automatically extract learnings worth remembering.

## Features

- 🧠 **Smart Extraction** - Automatically identify learnings from agent traces
- 🔓 **LLM-Agnostic** - Bring your own LLM (Anthropic, OpenAI, local models, custom)
- 🔐 **Privacy-First** - Support for local models (zero API costs, data stays on your infrastructure)
- 🎯 **Zero Vendor Lock-In** - Works with any LLM provider
- 📦 **Pre-Built Adapters** - Ready-to-use adapters for popular providers
- ⚡ **Post-Run Optimization** - No runtime overhead on your agents

## Installation

```bash
npm install @xache/extractor @xache/sdk
```

## Quick Start

### With Anthropic Claude

```typescript
import { MemoryExtractor, AnthropicAdapter } from '@xache/extractor';
import { XacheClient } from '@xache/sdk';

const extractor = new MemoryExtractor({
  llm: new AnthropicAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  })
});

const extractions = await extractor.extract({
  trace: agentExecutionLog,
  agentContext: 'customer-service'
});

// Store high-confidence learnings
const client = new XacheClient({ did, privateKey });
for (const ex of extractions) {
  if (ex.confidence > 0.8) {
    await client.memory[ex.suggestedMethod](ex.data);
  }
}
```

### With Local Ollama (Zero Cost, Privacy-First)

```typescript
import { MemoryExtractor, OllamaAdapter } from '@xache/extractor';

const extractor = new MemoryExtractor({
  llm: new OllamaAdapter({
    model: 'llama3.1:70b',
    baseUrl: 'http://localhost:11434'
  })
});

const extractions = await extractor.extract({ trace });

// ✓ Zero API costs
// ✓ Data never leaves your machine
// ✓ No API keys needed
```

### With Custom LLM

```typescript
const extractor = new MemoryExtractor({
  llm: async (prompt) => {
    // Use ANY LLM you want
    const response = await myLLM.complete(prompt);
    return response.text;
  }
});
```

## How It Works

```
┌─────────────────┐
│  Agent Trace    │  (logs, execution history)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ MemoryExtractor │  (generates extraction prompt)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Your LLM      │  (you provide: Claude, GPT, Llama, etc.)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Extractions    │  (structured learnings with confidence scores)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Xache Memory   │  (you decide what to store)
└─────────────────┘
```

**Xache provides:**
- Smart classification prompts
- Response parsing
- Pre-built adapters (convenience)

**You provide:**
- LLM connectivity (your API key, your choice, your cost)
- Storage decisions (what to remember)

## Supported LLM Providers

### Pre-Built Adapters

| Provider | Adapter | Benefits |
|----------|---------|----------|
| **Anthropic** | `AnthropicAdapter` | Best extraction quality |
| **OpenAI** | `OpenAIAdapter` | Wide availability |
| **Ollama** | `OllamaAdapter` | Zero cost, privacy-first |

### Custom LLMs

```typescript
// Cohere
llm: async (prompt) => {
  const response = await cohere.generate({ prompt, model: "command" });
  return response.generations[0].text;
}

// Mistral AI
llm: async (prompt) => {
  const response = await mistral.chat({
    messages: [{ role: "user", content: prompt }]
  });
  return response.choices[0].message.content;
}

// Your Custom Model
llm: async (prompt) => {
  const response = await myModel.complete(prompt);
  return response.text;
}
```

## What Gets Extracted?

The extractor classifies learnings into 8 standard memory types:

1. **USER_PREFERENCE** - User settings and preferences
   ```typescript
   { key: 'responseStyle', value: 'concise', userId: 'user_123' }
   ```

2. **ERROR_FIX** - Error-to-solution mappings
   ```typescript
   { error: 'TypeError: undefined', solution: 'Added null check', context: 'payment' }
   ```

3. **SUCCESSFUL_PATTERN** - Approaches that worked well
   ```typescript
   { pattern: 'Exponential backoff for API retries', success: true, confidence: 0.95 }
   ```

4. **FAILED_APPROACH** - Approaches to avoid
   ```typescript
   { pattern: 'WHERE clause optimization', success: false, domain: 'database' }
   ```

5. **TOOL_CONFIG** - Tool settings
   ```typescript
   { toolName: 'weatherAPI', config: { units: 'metric', timeout: 5000 } }
   ```

6. **CONVERSATION_SUMMARY** - Multi-turn summaries
   ```typescript
   { summary: 'User asked about restaurants, suggested 3 options', turns: 5 }
   ```

7. **DOMAIN_HEURISTIC** - Domain-specific insights
   ```typescript
   { domain: 'code-review', heuristic: 'Functions >50 lines should be refactored', confidence: 0.85 }
   ```

8. **OPTIMIZATION_INSIGHT** - Performance improvements
   ```typescript
   { operation: 'db-query', improvement: 'Added index', metrics: { before: 2500, after: 150, unit: 'ms' } }
   ```

## API Reference

### MemoryExtractor

```typescript
class MemoryExtractor {
  constructor(config: MemoryExtractorConfig)

  extract(params: ExtractParams): Promise<ExtractedMemory[]>
  batchExtract(traces: ExtractParams[]): Promise<ExtractedMemory[][]>
}
```

#### Configuration

```typescript
interface MemoryExtractorConfig {
  llm: LLMFunction | LLMAdapter;  // Your LLM (required)
  debug?: boolean;                 // Enable debug logging (default: false)
  confidenceThreshold?: number;    // Min confidence 0.0-1.0 (default: 0.7)
}
```

#### Extract Parameters

```typescript
interface ExtractParams {
  trace: string | object;           // Agent execution trace
  agentContext?: string;             // Domain hint (e.g., 'customer-service')
  confidenceThreshold?: number;      // Override default threshold
}
```

#### Extracted Memory

```typescript
interface ExtractedMemory {
  type: StandardContext;            // Memory type
  confidence: number;               // 0.0-1.0
  data: Record<string, unknown>;    // Structured data
  reasoning: string;                // Why this is worth remembering
  suggestedMethod: string;          // SDK method to use
  evidence?: string;                // Quote from trace
}
```

### Adapters

#### AnthropicAdapter

```typescript
new AnthropicAdapter({
  apiKey: string;
  model?: string;         // default: 'claude-3-5-sonnet-20241022'
  maxTokens?: number;     // default: 4096
  temperature?: number;   // default: 0.7
})
```

#### OpenAIAdapter

```typescript
new OpenAIAdapter({
  apiKey: string;
  model?: string;         // default: 'gpt-4-turbo'
  maxTokens?: number;     // default: 4096
  temperature?: number;   // default: 0.7
  baseUrl?: string;       // for Azure OpenAI
})
```

#### OllamaAdapter

```typescript
new OllamaAdapter({
  model: string;          // e.g., 'llama3.1:70b', 'mistral'
  baseUrl?: string;       // default: 'http://localhost:11434'
  temperature?: number;   // default: 0.7
  system?: string;        // optional system prompt
})
```

## Examples

See the `examples/` directory for complete working examples:

- `anthropic.ts` - Anthropic Claude integration
- `ollama-local.ts` - Local OSS model with zero costs
- `custom-llm.ts` - Custom LLM function

## When to Use

**✅ Use Memory Extractor When:**
- Running agents in production with logging
- Want to capture implicit learnings automatically
- Post-run optimization is acceptable
- Have budget for LLM calls (or use local models)

**❌ Don't Use When:**
- Real-time memory needed during execution (use memory tools directly)
- Trace data unavailable or sparse
- Learnings are deterministic (use framework control)

## Cost Considerations

**Commercial APIs (Anthropic, OpenAI, etc.):**
- ~1 LLM call per trace
- Typical trace: 1000-5000 tokens input, 500-1000 tokens output
- Estimated cost: $0.01-0.05 per trace with Claude Sonnet

**Local Models (Ollama):**
- ✓ Zero API costs
- ✓ Privacy-first (data never leaves your machine)
- ✓ Works with Llama, Mistral, Qwen, etc.

## Integration Paths

The Memory Extractor enables **Path #3: Post-run extraction** in Xache's integration model:

1. **Path #1: Framework-controlled** - Framework decides what to remember (deterministic)
2. **Path #2: Agent-decides** - Agent uses memory tools during execution (autonomous)
3. **Path #3: Post-run extraction** - Extractor analyzes traces after completion (optimization) ← **You are here**

## Privacy & Security

- ✓ **Xache never touches your API keys** - You provide LLM connectivity directly
- ✓ **No proxying** - Your LLM calls go directly to your chosen provider
- ✓ **Local model support** - Use Ollama for complete privacy
- ✓ **You control storage** - Decide which extractions to store

## License

MIT

## Links

- [Xache Protocol Documentation](https://github.com/xache-protocol/xache)
- [@xache/sdk on npm](https://www.npmjs.com/package/@xache/sdk)
- [Ollama](https://ollama.com/) - Run local LLMs

## Contributing

Contributions welcome! Especially new LLM adapters.

---

**Built with ❤️ for the Xache ecosystem**

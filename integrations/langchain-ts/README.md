# @xache/langchain

LangChain.js integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, ephemeral working memory, knowledge graph, and portable ERC-8004 reputation.

## Installation

```bash
npm install @xache/langchain @langchain/core langchain
```

## Quick Start

### One-Line Memory Replacement

```typescript
// Before (standard LangChain)
import { BufferMemory } from 'langchain/memory';
const memory = new BufferMemory();

// After (with Xache - one line change!)
import { XacheMemory } from '@xache/langchain';
const memory = new XacheMemory({
  walletAddress: '0x...',
  privateKey: '0x...',
});

// Everything else stays the same
const chain = new ConversationChain({ llm, memory });
```

## Features

### Memory Storage

Persistent memory that survives across sessions with cryptographic receipts:

```typescript
import { XacheMemory } from '@xache/langchain';

const memory = new XacheMemory({
  walletAddress: '0xYourWallet',
  privateKey: '0xYourPrivateKey',
  apiUrl: 'https://api.xache.xyz',
  chain: 'base',
});
```

### Retrieval (RAG)

Semantic search for retrieval-augmented generation:

```typescript
import { XacheRetriever } from '@xache/langchain';
import { RetrievalQAChain } from 'langchain/chains';

const retriever = new XacheRetriever({
  walletAddress: '0x...',
  privateKey: '0x...',
  k: 5,
});

const qa = RetrievalQAChain.fromLLM(llm, retriever);
```

### Collective Intelligence

```typescript
import {
  createCollectiveContributeTool,
  createCollectiveQueryTool,
} from '@xache/langchain';

const contributeTool = createCollectiveContributeTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

const queryTool = createCollectiveQueryTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});
```

### Memory Extraction

```typescript
import { XacheExtractor } from '@xache/langchain';

const extractor = new XacheExtractor({
  walletAddress: '0x...',
  privateKey: '0x...',
  mode: 'xache-managed',
});

const result = await extractor.extract(
  'User asked about quantum computing...',
  { autoStore: true }
);
```

### Knowledge Graph

Build and query a privacy-preserving knowledge graph:

```typescript
import {
  createGraphExtractTool,
  createGraphQueryTool,
  createGraphAskTool,
  createGraphLoadTool,
  createGraphAddEntityTool,
  createGraphAddRelationshipTool,
  createGraphMergeEntitiesTool,
  createGraphEntityHistoryTool,
  XacheGraphRetriever,
} from '@xache/langchain';

const config = {
  walletAddress: '0x...',
  privateKey: '0x...',
  llmProvider: 'anthropic',
  llmApiKey: 'sk-ant-...',
};

const extractTool = createGraphExtractTool(config);
const queryTool = createGraphQueryTool(config);
const askTool = createGraphAskTool(config);
const loadTool = createGraphLoadTool(config);

// Use graph as a retriever for RAG
const graphRetriever = new XacheGraphRetriever({
  walletAddress: '0x...',
  privateKey: '0x...',
  k: 10,
});
```

### Cognition (Memory Probe)

Zero-knowledge semantic search — check what your agent already knows before storing or retrieving. Free and unlimited.

```typescript
import { createProbeTool } from '@xache/langchain';

const probeTool = createProbeTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

// Add to agent's toolkit alongside other tools
const tools = [probeTool, ...otherTools];
```

### Ephemeral Context (Working Memory)

Short-lived scratch sessions for multi-turn workflows with 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`):

```typescript
import {
  createEphemeralCreateSessionTool,
  createEphemeralWriteSlotTool,
  createEphemeralReadSlotTool,
  createEphemeralPromoteTool,
  createEphemeralStatusTool,
} from '@xache/langchain';

const config = {
  walletAddress: '0x...',
  privateKey: '0x...',
};

// Create tools for your agent
const createSessionTool = createEphemeralCreateSessionTool(config);
const writeSlotTool = createEphemeralWriteSlotTool(config);
const readSlotTool = createEphemeralReadSlotTool(config);
const promoteTool = createEphemeralPromoteTool(config);
const statusTool = createEphemeralStatusTool(config);

// Add to agent's toolkit
const tools = [createSessionTool, writeSlotTool, readSlotTool, promoteTool, statusTool];
```

Or use class-based wrappers:

```typescript
import {
  XacheEphemeralCreateSessionTool,
  XacheEphemeralWriteSlotTool,
  XacheEphemeralReadSlotTool,
  XacheEphemeralPromoteTool,
  XacheEphemeralStatusTool,
} from '@xache/langchain';

const createSession = new XacheEphemeralCreateSessionTool(config);
const tool = createSession.asTool();
```

### Reputation

```typescript
import { createReputationTool, XacheReputationChecker } from '@xache/langchain';

const repTool = createReputationTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

const checker = new XacheReputationChecker({
  walletAddress: '0x...',
  privateKey: '0x...',
});
```

## Chat History

```typescript
import { XacheChatMessageHistory } from '@xache/langchain';
import { BufferMemory } from 'langchain/memory';

const history = new XacheChatMessageHistory({
  walletAddress: '0x...',
  privateKey: '0x...',
  sessionId: 'unique-session-id',
});

const memory = new BufferMemory({ chatHistory: history });
```

## Pricing

All operations use x402 micropayments (auto-handled):

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Memory Probe (semantic search) | Free |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |
| Ephemeral Session | $0.005 |
| Ephemeral Promote | $0.05 |
| Extraction (managed) | $0.011 |
| Graph Operations | $0.002 |
| Graph Ask (managed) | $0.011 |

## Resources

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

## License

MIT

# @xache/langchain

LangChain.js integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, and portable ERC-8004 reputation.

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
  apiUrl: 'https://api.xache.xyz', // optional
  chain: 'base', // or 'solana'
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
  k: 5, // number of documents
});

const qa = RetrievalQAChain.fromLLM(llm, retriever);
```

### Collective Intelligence

Query and contribute to shared knowledge:

```typescript
import {
  createCollectiveContributeTool,
  createCollectiveQueryTool,
} from '@xache/langchain';

// Add to your agent's tools
const contributeTool = createCollectiveContributeTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

const queryTool = createCollectiveQueryTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

const tools = [contributeTool, queryTool];
```

### Memory Extraction

Auto-extract memories from conversations:

```typescript
import { XacheExtractor } from '@xache/langchain';

const extractor = new XacheExtractor({
  walletAddress: '0x...',
  privateKey: '0x...',
  mode: 'xache-managed', // or 'api-key' with your LLM key
});

const result = await extractor.extract(
  'User asked about quantum computing...',
  { autoStore: true }
);

console.log(`Extracted ${result.count} memories`);
```

### Reputation

Check and verify agent reputation:

```typescript
import { createReputationTool, XacheReputationChecker } from '@xache/langchain';

// As a tool for your agent
const repTool = createReputationTool({
  walletAddress: '0x...',
  privateKey: '0x...',
});

// Or check other agents
const checker = new XacheReputationChecker({
  walletAddress: '0x...',
  privateKey: '0x...',
});

const otherRep = await checker.check('did:agent:evm:0xOtherAgent...');
if (otherRep.score >= 0.5) {
  console.log('Agent is trustworthy');
}
```

## Chat History

For more control over message history:

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

| Operation            | Price  |
| -------------------- | ------ |
| Memory Store         | $0.002 |
| Memory Retrieve      | $0.003 |
| Collective Contribute| $0.002 |
| Collective Query     | $0.011 |
| Extraction (managed) | $0.011 |

## ERC-8004 Portable Reputation

Xache supports [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) for portable, on-chain reputation. Enable it to make your agent's reputation verifiable across platforms.

## Resources

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

## License

MIT

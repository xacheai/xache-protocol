# Xache Protocol

Official SDKs, MCP server, and framework integrations for [Xache](https://xache.xyz) - verifiable memory, collective intelligence, knowledge graphs, and reputation for AI agents.

## What is Xache?

Xache provides infrastructure for AI agents to:
- **Store & retrieve memories** with cryptographic receipts
- **Build knowledge graphs** - extract entities and relationships, query with natural language
- **Contribute to collective intelligence** and earn reputation
- **Extract learnings** from conversations using LLM (10+ providers, BYO key or managed)
- **Build verifiable reputation** portable across platforms via ERC-8004
- **Pay-per-use** via x402 protocol (crypto micropayments, no subscriptions)

## Packages

### SDKs

| Package | Language | Version | Install |
|---------|----------|---------|---------|
| [@xache/sdk](./sdks/typescript) | TypeScript | 5.6.0 | `npm install @xache/sdk` |
| [xache](./sdks/python) | Python | 5.6.0 | `pip install xache` |

### MCP Server

| Package | Version | Install |
|---------|---------|---------|
| [@xache/mcp-server](./mcp) | 0.5.0 | `npm install -g @xache/mcp-server` |

Works with Claude Desktop, Claude Code, Cursor, OpenClaw, and any MCP-compatible client.

### Framework Integrations

| Package | Framework | Version | Install |
|---------|-----------|---------|---------|
| [@xache/langchain](./integrations/langchain-ts) | LangChain.js | 0.4.0 | `npm install @xache/langchain` |
| [langchain-xache](./integrations/langchain-python) | LangChain Python | 0.4.0 | `pip install langchain-xache` |
| [crewai-xache](./integrations/crewai) | CrewAI | 0.2.0 | `pip install crewai-xache` |
| [autogen-xache](./integrations/autogen) | AutoGen | 0.2.0 | `pip install autogen-xache` |
| [openclaw-xache](./integrations/openclaw) | OpenClaw | 0.2.0 | `pip install openclaw-xache` |

## Quick Start

### TypeScript

```typescript
import { XacheClient } from '@xache/sdk';

const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: process.env.PRIVATE_KEY,
});

// Store a memory
const result = await client.memory.store({
  data: { preference: 'dark_mode', value: true },
  storageTier: 'hot',
  context: 'user-preferences',
});

console.log('Storage Key:', result.storageKey);
console.log('Receipt:', result.receiptId);

// Extract entities into knowledge graph
const graph = await client.graph.extract({
  trace: 'Alice manages the ML team at Acme Corp.',
  domain: 'engineering',
});

console.log('Entities:', graph.entities);
console.log('Relationships:', graph.relationships);

// Ask questions about the knowledge graph
const answer = await client.graph.ask({
  question: 'Who manages the ML team?',
});

console.log('Answer:', answer.answer);
```

### Python

```python
import os
from xache import XacheClient

async with XacheClient(
    api_url="https://api.xache.xyz",
    did="did:agent:evm:0xYourWalletAddress",
    private_key=os.environ["PRIVATE_KEY"],
) as client:
    # Store a memory
    result = await client.memory.store(
        data={"preference": "dark_mode", "value": True},
        storage_tier="hot",
        metadata={"context": "user-preferences"},
    )

    print(f"Memory ID: {result.memory_id}")
    print(f"Receipt: {result.receipt_id}")

    # Extract entities into knowledge graph
    graph = await client.graph.extract(
        trace="Alice manages the ML team at Acme Corp.",
        domain="engineering",
    )

    print(f"Entities: {graph.entities}")
    print(f"Relationships: {graph.relationships}")

    # Ask questions about the knowledge graph
    answer = await client.graph.ask(
        question="Who manages the ML team?",
    )

    print(f"Answer: {answer.answer}")
```

### MCP Server (Claude Desktop / Cursor)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "xache": {
      "command": "npx",
      "args": ["@xache/mcp-server"],
      "env": {
        "XACHE_WALLET_ADDRESS": "0xYourWalletAddress",
        "XACHE_PRIVATE_KEY": "your-private-key"
      }
    }
  }
}
```

This gives your AI assistant 18 tools: memory (store/retrieve/list), collective intelligence (contribute/query/list), knowledge graph (extract/load/query/ask/add entity/add relationship/merge/history), extraction, and reputation.

## Features

### Memory Storage
- Hot, warm, and cold storage tiers
- Cryptographic receipts with Merkle proofs
- Subject-based access control and multi-tenancy
- Batch operations

### Knowledge Graph
- Extract entities and relationships from text using LLM
- Natural language Q&A over your knowledge graph
- Query subgraphs around specific entities
- Add entities and relationships manually
- Merge duplicate entities with full version history
- Time-travel queries (view graph at any point in time)

### Collective Intelligence
- Contribute heuristics and patterns, earn reputation
- Query collective knowledge from other agents
- Semantic search with domain filtering

### Memory Extraction
- LLM-powered extraction of structured learnings from conversations
- 10+ provider support (Anthropic, OpenAI, Google, Mistral, Groq, Together, etc.)
- BYO API key ($0.002) or Xache-managed LLM ($0.011)
- Custom endpoint support (Ollama, vLLM, LiteLLM)
- Auto-store extracted memories and auto-contribute to collective

### Reputation System
- Verifiable on-chain reputation built through quality contributions
- ERC-8004 portable reputation — travels with your agent across platforms
- Reputation levels: New, Developing, Established, Trusted, Elite

## Pricing

Xache uses the [x402 protocol](https://x402.org) for pay-per-use micropayments. No subscriptions, no monthly minimums. The SDK handles payments automatically.

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |
| Graph Operations | $0.002 |
| Graph Ask (managed LLM) | $0.011 |
| Extraction (BYO key) | $0.002 |
| Extraction (managed LLM) | $0.011 |

Supported chains: Base, Solana

## Documentation

- [TypeScript SDK](./sdks/typescript/README.md)
- [Python SDK](./sdks/python/README.md)
- [MCP Server](./mcp/README.md)
- [LangChain.js](./integrations/langchain-ts/README.md)
- [LangChain Python](./integrations/langchain-python/README.md)
- [CrewAI](./integrations/crewai/README.md)
- [AutoGen](./integrations/autogen/README.md)
- [OpenClaw](./integrations/openclaw/README.md)

## License

MIT License - see [LICENSE](./LICENSE)

## Links

- [Documentation](https://docs.xache.xyz)
- [Website](https://xache.xyz)
- [Console](https://console.xache.xyz)

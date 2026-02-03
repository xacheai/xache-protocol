# Xache Protocol

Official SDKs, MCP server, and framework integrations for [Xache](https://xache.xyz) - verifiable memory, collective intelligence, and reputation for AI agents.

## What is Xache?

Xache provides infrastructure for AI agents to:
- **Store & retrieve memories** with cryptographic receipts
- **Contribute to collective intelligence** and earn reputation
- **Build verifiable reputation** across agent interactions
- **Pay-per-use** via x402 protocol (crypto micropayments)

## Packages

### SDKs

| Package | Language | Install | Description |
|---------|----------|---------|-------------|
| [@xache/sdk](./sdks/typescript) | TypeScript | `npm install @xache/sdk` | Core SDK for Node.js/browsers |
| [xache](./sdks/python) | Python | `pip install xache` | Core SDK for Python |

### MCP Server

| Package | Install | Description |
|---------|---------|-------------|
| [@xache/mcp-server](./mcp) | `npm install -g @xache/mcp-server` | Model Context Protocol server for Claude |

### Framework Integrations

| Package | Framework | Install | Description |
|---------|-----------|---------|-------------|
| [@xache/langchain](./integrations/langchain-ts) | LangChain.js | `npm install @xache/langchain` | LangChain TypeScript integration |
| [langchain-xache](./integrations/langchain-python) | LangChain | `pip install langchain-xache` | LangChain Python integration |
| [crewai-xache](./integrations/crewai) | CrewAI | `pip install crewai-xache` | CrewAI memory integration |
| [autogen-xache](./integrations/autogen) | AutoGen | `pip install autogen-xache` | Microsoft AutoGen integration |
| [openclaw-xache](./integrations/openclaw) | OpenClaw | `pip install openclaw-xache` | OpenClaw skill integration |

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
```

### MCP Server (Claude Desktop)

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

## Features

### Memory Storage
- Hot, warm, and cold storage tiers
- Cryptographic receipts with Merkle proofs
- Subject-based access control
- Batch operations

### Collective Intelligence
- Contribute heuristics and earn reputation
- Query collective knowledge
- Semantic search with context

### Reputation System
- Verifiable on-chain reputation
- ERC-8004 portable reputation export
- Contribution tracking

### Memory Extraction
- LLM-powered memory extraction from conversations
- 10+ provider support (Anthropic, OpenAI, Google, Mistral, etc.)
- Custom endpoint support (Ollama, vLLM, etc.)

## Documentation

- [TypeScript SDK Documentation](./sdks/typescript/README.md)
- [Python SDK Documentation](./sdks/python/README.md)
- [MCP Server Documentation](./mcp/README.md)

## Payment

Xache uses the [x402 protocol](https://x402.org) for pay-per-use micropayments. The SDK handles payments automatically:

- Memory store: $0.002
- Memory retrieve: $0.003
- Collective contribute: $0.002
- Collective query: $0.011
- Extraction (BYOK): $0.002
- Extraction (managed): $0.011

Supported chains: Base, Solana

## License

MIT License - see [LICENSE](./LICENSE)

## Links

- [Documentation](https://docs.xache.xyz)
- [Website](https://xache.xyz)
- [Console](https://console.xache.xyz)

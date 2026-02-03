# langchain-xache

LangChain integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, and portable ERC-8004 reputation.

## Installation

```bash
pip install langchain-xache
```

## Quick Start

### One-Line Memory Replacement

```python
# Before (standard LangChain)
from langchain.memory import ConversationBufferMemory
memory = ConversationBufferMemory()

# After (with Xache - one line change!)
from xache_langchain import XacheMemory
memory = XacheMemory(
    wallet_address="0x...",
    private_key="0x..."
)

# Everything else stays the same
agent = initialize_agent(tools, llm, memory=memory)
```

## Features

### Memory Storage
Persistent memory that survives across sessions with cryptographic receipts:

```python
from xache_langchain import XacheMemory

memory = XacheMemory(
    wallet_address="0xYourWallet",
    private_key="0xYourPrivateKey",
    api_url="https://api.xache.xyz",  # optional
    chain="base"  # or "solana"
)
```

### Retrieval (RAG)
Semantic search for retrieval-augmented generation:

```python
from xache_langchain import XacheRetriever
from langchain.chains import RetrievalQA

retriever = XacheRetriever(
    wallet_address="0x...",
    private_key="0x...",
    k=5  # number of documents
)

qa = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
```

### Collective Intelligence
Query and contribute to shared knowledge:

```python
from xache_langchain import XacheCollectiveContributeTool, XacheCollectiveQueryTool

# Add to your agent's tools
contribute = XacheCollectiveContributeTool(
    wallet_address="0x...",
    private_key="0x..."
)

query = XacheCollectiveQueryTool(
    wallet_address="0x...",
    private_key="0x..."
)

tools = [contribute, query, ...]
```

### Memory Extraction
Auto-extract memories from conversations:

```python
from xache_langchain import XacheExtractor

extractor = XacheExtractor(
    wallet_address="0x...",
    private_key="0x...",
    mode="xache-managed"  # or "api-key" with your LLM key
)

result = extractor.extract(
    trace="User asked about quantum computing...",
    auto_store=True  # automatically store extracted memories
)

print(f"Extracted {len(result.memories)} memories")
```

### Reputation
Check and verify agent reputation:

```python
from xache_langchain import XacheReputationTool, XacheReputationChecker

# As a tool for your agent
rep_tool = XacheReputationTool(
    wallet_address="0x...",
    private_key="0x..."
)

# Or check other agents
checker = XacheReputationChecker(
    wallet_address="0x...",
    private_key="0x..."
)

other_rep = checker.check("did:agent:evm:0xOtherAgent...")
if other_rep.score >= 0.5:
    print("Agent is trustworthy")
```

## Chat History

For more control over message history:

```python
from xache_langchain import XacheChatMessageHistory
from langchain.memory import ConversationBufferMemory

history = XacheChatMessageHistory(
    wallet_address="0x...",
    private_key="0x...",
    session_id="unique-session-id"
)

memory = ConversationBufferMemory(chat_memory=history)
```

## Pricing

All operations use x402 micropayments (auto-handled):

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |
| Extraction (managed) | $0.011 |

## ERC-8004 Portable Reputation

Xache supports [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) for portable, on-chain reputation. Enable it to make your agent's reputation verifiable across platforms.

## Resources

- [Documentation](https://docs.xache.xyz)
- [API Reference](https://docs.xache.xyz/api)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

## License

MIT

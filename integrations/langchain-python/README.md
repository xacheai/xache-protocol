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

### Knowledge Graph

Build and query a privacy-preserving knowledge graph of entities and relationships:

```python
from xache_langchain import (
    XacheGraphExtractTool,
    XacheGraphLoadTool,
    XacheGraphQueryTool,
    XacheGraphAskTool,
    XacheGraphAddEntityTool,
    XacheGraphAddRelationshipTool,
    XacheGraphMergeEntitiesTool,
    XacheGraphEntityHistoryTool,
    XacheGraphRetriever,
)

config = {
    "wallet_address": "0x...",
    "private_key": "0x...",
    "llm_provider": "anthropic",
    "llm_api_key": "sk-ant-...",
}

# Extract entities from text
extract_tool = XacheGraphExtractTool(**config)

# Query graph around an entity
query_tool = XacheGraphQueryTool(wallet_address="0x...", private_key="0x...")

# Ask natural language questions
ask_tool = XacheGraphAskTool(**config)

# Load the full graph
load_tool = XacheGraphLoadTool(wallet_address="0x...", private_key="0x...")

# Add entities and relationships manually
add_entity_tool = XacheGraphAddEntityTool(wallet_address="0x...", private_key="0x...")
add_rel_tool = XacheGraphAddRelationshipTool(wallet_address="0x...", private_key="0x...")

# Merge duplicate entities
merge_tool = XacheGraphMergeEntitiesTool(wallet_address="0x...", private_key="0x...")

# View entity version history
history_tool = XacheGraphEntityHistoryTool(wallet_address="0x...", private_key="0x...")

# Use as a retriever for RAG
graph_retriever = XacheGraphRetriever(
    wallet_address="0x...",
    private_key="0x...",
    k=10
)

docs = graph_retriever.get_relevant_documents("engineering team")
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
| Graph Operations | $0.002 |
| Graph Ask (managed) | $0.011 |

## ERC-8004 Portable Reputation

Xache supports [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) for portable, on-chain reputation. Enable it to make your agent's reputation verifiable across platforms.

## Resources

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

## License

MIT

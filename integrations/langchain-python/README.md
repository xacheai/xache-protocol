# langchain-xache

LangChain integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, ephemeral working memory, knowledge graph, and portable ERC-8004 reputation.

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
    api_url="https://api.xache.xyz",
    chain="base"
)
```

### Retrieval (RAG)

```python
from xache_langchain import XacheRetriever
from langchain.chains import RetrievalQA

retriever = XacheRetriever(
    wallet_address="0x...",
    private_key="0x...",
    k=5
)

qa = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
```

### Collective Intelligence

```python
from xache_langchain import XacheCollectiveContributeTool, XacheCollectiveQueryTool

contribute = XacheCollectiveContributeTool(
    wallet_address="0x...",
    private_key="0x..."
)

query = XacheCollectiveQueryTool(
    wallet_address="0x...",
    private_key="0x..."
)

tools = [contribute, query]
```

### Memory Extraction

```python
from xache_langchain import XacheExtractor

extractor = XacheExtractor(
    wallet_address="0x...",
    private_key="0x...",
    mode="xache-managed"
)

result = extractor.extract(
    trace="User asked about quantum computing...",
    auto_store=True
)
```

### Knowledge Graph

Build and query a privacy-preserving knowledge graph:

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

extract_tool = XacheGraphExtractTool(**config)
query_tool = XacheGraphQueryTool(wallet_address="0x...", private_key="0x...")
ask_tool = XacheGraphAskTool(**config)

# Use as a retriever for RAG
graph_retriever = XacheGraphRetriever(
    wallet_address="0x...",
    private_key="0x...",
    k=10
)
```

### Ephemeral Context (Working Memory)

Short-lived scratch sessions for multi-turn workflows with 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`):

```python
from xache_langchain import (
    XacheEphemeralCreateSessionTool,
    XacheEphemeralWriteSlotTool,
    XacheEphemeralReadSlotTool,
    XacheEphemeralPromoteTool,
    XacheEphemeralStatusTool,
)

# Create tools for your agent
create_session = XacheEphemeralCreateSessionTool(
    wallet_address="0x...",
    private_key="0x..."
)

write_slot = XacheEphemeralWriteSlotTool(
    wallet_address="0x...",
    private_key="0x..."
)

read_slot = XacheEphemeralReadSlotTool(
    wallet_address="0x...",
    private_key="0x..."
)

promote = XacheEphemeralPromoteTool(
    wallet_address="0x...",
    private_key="0x..."
)

status = XacheEphemeralStatusTool(
    wallet_address="0x...",
    private_key="0x..."
)

tools = [create_session, write_slot, read_slot, promote, status]
```

**Typical agent workflow:**
1. Agent creates a session at the start of a conversation
2. Writes facts, tasks, and context to slots as conversation progresses
3. Reads slots to maintain context across turns
4. Promotes the session to persistent memory when the conversation has lasting value
5. Or lets the session expire if the context is transient

### Reputation

```python
from xache_langchain import XacheReputationTool, XacheReputationChecker

rep_tool = XacheReputationTool(
    wallet_address="0x...",
    private_key="0x..."
)

checker = XacheReputationChecker(
    wallet_address="0x...",
    private_key="0x..."
)
```

## Chat History

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

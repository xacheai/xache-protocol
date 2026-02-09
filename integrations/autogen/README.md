# autogen-xache

AutoGen integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, ephemeral working memory, knowledge graph, and portable ERC-8004 reputation.

## Installation

```bash
pip install autogen-xache
```

## Quick Start

### Create an Agent with Xache Memory

```python
from autogen import UserProxyAgent
from xache_autogen import XacheAssistantAgent

assistant = XacheAssistantAgent(
    name="assistant",
    wallet_address="0x...",
    private_key="0x...",
    llm_config={"model": "gpt-4"}
)

user_proxy = UserProxyAgent(
    name="user",
    human_input_mode="TERMINATE"
)

user_proxy.initiate_chat(
    assistant,
    message="Research quantum computing and remember the key findings"
)
```

### Add Xache Functions to Any Agent

```python
from autogen import AssistantAgent
from xache_autogen import xache_functions

llm_config = {
    "model": "gpt-4",
    "functions": xache_functions
}

agent = AssistantAgent(name="researcher", llm_config=llm_config)
```

## Available Functions

### Memory Functions
- **xache_memory_store** - Store information with cryptographic receipts
- **xache_memory_retrieve** - Retrieve stored memories by semantic search

### Collective Intelligence Functions
- **xache_collective_contribute** - Share insights with other agents
- **xache_collective_query** - Learn from community knowledge

### Knowledge Graph Functions
- **xache_graph_extract** - Extract entities/relationships from text
- **xache_graph_load** - Load the full knowledge graph
- **xache_graph_query** - Query graph around an entity
- **xache_graph_ask** - Ask natural language questions about the graph
- **xache_graph_add_entity** - Add an entity manually
- **xache_graph_add_relationship** - Create a relationship between entities
- **xache_graph_merge_entities** - Merge duplicate entities
- **xache_graph_entity_history** - View entity version history

### Ephemeral Context Functions
- **xache_ephemeral_create_session** - Create a short-lived working memory session
- **xache_ephemeral_write_slot** - Write data to a session slot (conversation, facts, tasks, cache, scratch, handoff)
- **xache_ephemeral_read_slot** - Read data from a session slot
- **xache_ephemeral_promote** - Promote session to persistent memory
- **xache_ephemeral_status** - Get session status and details

### Extraction Functions
- **xache_extract_memories** - Extract memories from conversation text using LLM

### Reputation Functions
- **xache_check_reputation** - View reputation score and ERC-8004 status

## Ephemeral Context

Ephemeral context gives agents short-lived scratch sessions for multi-turn workflows. Sessions have 6 named slots and auto-expire.

```python
from xache_autogen import (
    ephemeral_create_session,
    ephemeral_write_slot,
    ephemeral_read_slot,
    ephemeral_promote,
    ephemeral_status,
)

config = {
    "wallet_address": "0x...",
    "private_key": "0x...",
}

# Create a session (1 hour TTL)
session = ephemeral_create_session(ttl_seconds=3600, **config)
session_key = session["sessionKey"]

# Write context to slots
ephemeral_write_slot(
    session_key=session_key,
    slot="facts",
    data={"user_name": "Alice", "topic": "quantum computing"},
    **config
)

ephemeral_write_slot(
    session_key=session_key,
    slot="tasks",
    data={"pending": ["summarize findings", "generate report"]},
    **config
)

# Read slot data
facts = ephemeral_read_slot(session_key=session_key, slot="facts", **config)

# Check session status
info = ephemeral_status(session_key=session_key, **config)
print(f"Status: {info['status']}, Active slots: {info['activeSlots']}")

# Promote to persistent memory when done
result = ephemeral_promote(session_key=session_key, **config)
print(f"Created {result['memoriesCreated']} persistent memories")
```

## Agent Types

### XacheAssistantAgent

```python
from xache_autogen import XacheAssistantAgent

assistant = XacheAssistantAgent(
    name="assistant",
    wallet_address="0x...",
    private_key="0x...",
    system_message="You are a helpful assistant with persistent memory.",
    llm_config={"model": "gpt-4"}
)
```

### XacheMemoryAgent

```python
from xache_autogen import XacheMemoryAgent

agent = XacheMemoryAgent(
    name="researcher",
    wallet_address="0x...",
    private_key="0x...",
    llm_config={"model": "gpt-4"}
)
```

## Conversation Memory

```python
from xache_autogen import XacheConversationMemory

memory = XacheConversationMemory(
    wallet_address="0x...",
    private_key="0x...",
    conversation_id="unique-session-id"
)

memory.add_message("user", "Hello!")
memory.add_message("assistant", "Hi there!")

history = memory.get_history()
results = memory.search("quantum computing")
context = memory.format_for_prompt(max_messages=5)
```

## Multi-Agent Conversations

```python
from autogen import UserProxyAgent, GroupChat, GroupChatManager
from xache_autogen import XacheAssistantAgent

config = {"wallet_address": "0x...", "private_key": "0x..."}

researcher = XacheAssistantAgent(
    name="researcher",
    system_message="You research topics and store findings.",
    llm_config={"model": "gpt-4"},
    **config
)

writer = XacheAssistantAgent(
    name="writer",
    system_message="You write articles based on research.",
    llm_config={"model": "gpt-4"},
    **config
)

user_proxy = UserProxyAgent(name="user")

groupchat = GroupChat(agents=[user_proxy, researcher, writer], messages=[], max_round=10)
manager = GroupChatManager(groupchat=groupchat, llm_config={"model": "gpt-4"})

user_proxy.initiate_chat(manager, message="Research AI safety and write an article")
```

## Direct Function Usage

```python
from xache_autogen import (
    memory_store,
    memory_retrieve,
    collective_contribute,
    collective_query,
    check_reputation,
    graph_extract,
    graph_ask,
    extract_memories,
)

config = {"wallet_address": "0x...", "private_key": "0x..."}

result = memory_store(content="Important finding", context="research", **config)
memories = memory_retrieve(query="quantum computing", limit=5, **config)
rep = check_reputation(**config)
```

## Pricing

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

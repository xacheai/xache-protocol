# autogen-xache

AutoGen integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, and portable ERC-8004 reputation.

## Installation

```bash
pip install autogen-xache
```

## Quick Start

### Create an Agent with Xache Memory

```python
from autogen import UserProxyAgent
from xache_autogen import XacheAssistantAgent

# Create an assistant with Xache capabilities
assistant = XacheAssistantAgent(
    name="assistant",
    wallet_address="0x...",
    private_key="0x...",
    llm_config={"model": "gpt-4"}
)

# Create a user proxy
user_proxy = UserProxyAgent(
    name="user",
    human_input_mode="TERMINATE"
)

# Start conversation
user_proxy.initiate_chat(
    assistant,
    message="Research quantum computing and remember the key findings"
)
```

### Add Xache Functions to Any Agent

```python
from autogen import AssistantAgent
from xache_autogen import xache_functions

# Add Xache functions to LLM config
llm_config = {
    "model": "gpt-4",
    "functions": xache_functions
}

agent = AssistantAgent(
    name="researcher",
    llm_config=llm_config
)
```

## Features

### Available Functions

The `xache_functions` list provides these capabilities:

#### Memory Functions
- **xache_memory_store** - Store information with cryptographic receipts
- **xache_memory_retrieve** - Retrieve stored memories by semantic search

#### Collective Intelligence Functions
- **xache_collective_contribute** - Share insights with other agents
- **xache_collective_query** - Learn from community knowledge

#### Reputation Functions
- **xache_check_reputation** - View reputation score and ERC-8004 status

### Agent Types

#### XacheMemoryAgent

Basic conversable agent with Xache capabilities:

```python
from xache_autogen import XacheMemoryAgent

agent = XacheMemoryAgent(
    name="researcher",
    wallet_address="0x...",
    private_key="0x...",
    llm_config={"model": "gpt-4"}
)
```

#### XacheAssistantAgent

Extended AssistantAgent with Xache capabilities:

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

### Conversation Memory

Store and retrieve conversation history:

```python
from xache_autogen import XacheConversationMemory

memory = XacheConversationMemory(
    wallet_address="0x...",
    private_key="0x...",
    conversation_id="unique-session-id"
)

# Add messages
memory.add_message("user", "Hello!")
memory.add_message("assistant", "Hi there! How can I help?")

# Get history
history = memory.get_history()

# Store a summary
memory.store_summary("User greeted the assistant.")

# Search past conversations
results = memory.search("quantum computing")

# Format for prompt
context = memory.format_for_prompt(max_messages=5)
```

## Multi-Agent Conversations

Xache works seamlessly with multi-agent setups:

```python
from autogen import UserProxyAgent, GroupChat, GroupChatManager
from xache_autogen import XacheAssistantAgent

# Shared wallet = shared memory
config = {
    "wallet_address": "0x...",
    "private_key": "0x...",
}

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

# Create group chat
groupchat = GroupChat(
    agents=[user_proxy, researcher, writer],
    messages=[],
    max_round=10
)

manager = GroupChatManager(
    groupchat=groupchat,
    llm_config={"model": "gpt-4"}
)

# Both agents share the same memory pool
user_proxy.initiate_chat(
    manager,
    message="Research AI safety and write an article"
)
```

## Direct Function Usage

Use Xache functions directly outside agents:

```python
from xache_autogen import (
    memory_store,
    memory_retrieve,
    collective_contribute,
    collective_query,
    check_reputation,
)

config = {
    "wallet_address": "0x...",
    "private_key": "0x...",
}

# Store a memory
result = memory_store(
    content="Important finding about quantum computing",
    context="research",
    tags=["quantum", "computing"],
    **config
)
print(f"Stored: {result['memoryId']}")

# Retrieve memories
memories = memory_retrieve(
    query="quantum computing",
    limit=5,
    **config
)
print(f"Found {memories['count']} memories")

# Contribute to collective
collective_contribute(
    insight="Quantum computers excel at optimization problems",
    domain="quantum-computing",
    evidence="Research paper XYZ",
    **config
)

# Query collective
insights = collective_query(
    query="quantum computing applications",
    domain="quantum-computing",
    **config
)

# Check reputation
rep = check_reputation(**config)
print(f"Reputation: {rep['score']} ({rep['level']})")
```

## Pricing

All operations use x402 micropayments (auto-handled):

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |

## ERC-8004 Portable Reputation

Your agents build reputation through quality contributions and payments. Enable ERC-8004 to make reputation portable and verifiable across platforms.

## Resources

- [Documentation](https://docs.xache.xyz)
- [API Reference](https://docs.xache.xyz/api)
- [GitHub](https://github.com/oliveskin/xache)
- [Discord](https://discord.gg/xache)

## License

MIT

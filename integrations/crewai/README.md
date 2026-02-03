# crewai-xache

CrewAI integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, and portable ERC-8004 reputation.

## Installation

```bash
pip install crewai-xache
```

## Quick Start

### Add Xache Tools to Your Crew

```python
from crewai import Agent, Task, Crew
from xache_crewai import xache_tools

# Create an agent with Xache tools
researcher = Agent(
    role="Researcher",
    goal="Research and remember important findings",
    backstory="An expert researcher with persistent memory",
    tools=xache_tools(
        wallet_address="0x...",
        private_key="0x..."
    )
)

task = Task(
    description="Research quantum computing and store key findings",
    agent=researcher
)

crew = Crew(agents=[researcher], tasks=[task])
crew.kickoff()
```

### Add Persistent Memory to Your Crew

```python
from crewai import Crew
from xache_crewai import XacheMemory

# Create Xache memory
memory = XacheMemory(
    wallet_address="0x...",
    private_key="0x..."
)

# Use with your crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    memory=memory  # Persists across crew executions
)
```

## Features

### Available Tools

The `xache_tools()` function returns a set of tools for your agents:

#### Memory Tools
- **xache_memory_store** - Store information with cryptographic receipts
- **xache_memory_retrieve** - Retrieve stored memories by semantic search

#### Collective Intelligence Tools
- **xache_collective_contribute** - Share insights with other agents
- **xache_collective_query** - Learn from community knowledge

#### Reputation Tools
- **xache_check_reputation** - View reputation score and ERC-8004 status

### Selective Tool Loading

```python
# Only memory tools
tools = xache_tools(
    wallet_address="0x...",
    private_key="0x...",
    include_memory=True,
    include_collective=False,
    include_reputation=False
)

# Only collective tools
tools = xache_tools(
    wallet_address="0x...",
    private_key="0x...",
    include_memory=False,
    include_collective=True,
    include_reputation=False
)
```

### Individual Tool Usage

```python
from xache_crewai import (
    XacheMemoryStoreTool,
    XacheMemoryRetrieveTool,
    XacheCollectiveContributeTool,
    XacheCollectiveQueryTool,
    XacheReputationTool,
)

# Create specific tools
store_tool = XacheMemoryStoreTool(
    wallet_address="0x...",
    private_key="0x..."
)

agent = Agent(
    role="Writer",
    tools=[store_tool]  # Only give this agent storage capability
)
```

## Memory Types

### Standard Memory

```python
from xache_crewai import XacheMemory

memory = XacheMemory(
    wallet_address="0x...",
    private_key="0x..."
)

# Save a memory
memory_id = memory.save(
    value="Important finding about quantum computing",
    metadata={"source": "research"},
    agent="researcher"
)

# Search memories
results = memory.search(
    query="quantum computing",
    agent="researcher",
    limit=5
)
```

### Short-Term Memory

```python
from xache_crewai import XacheShortTermMemory

short_term = XacheShortTermMemory(
    wallet_address="0x...",
    private_key="0x..."
)

# Items tagged as short-term for easy filtering
short_term.save("Current task context")
```

### Long-Term Memory

```python
from xache_crewai import XacheLongTermMemory

long_term = XacheLongTermMemory(
    wallet_address="0x...",
    private_key="0x..."
)

# Items tagged as long-term, persists across sessions
long_term.save("Core knowledge that should be retained")
```

## Multi-Agent Crews

Each agent can have isolated or shared memories:

```python
from crewai import Agent, Crew
from xache_crewai import xache_tools, XacheMemory

# Shared wallet = shared memory
shared_config = {
    "wallet_address": "0xSharedWallet...",
    "private_key": "0xSharedKey..."
}

researcher = Agent(
    role="Researcher",
    tools=xache_tools(**shared_config)
)

writer = Agent(
    role="Writer",
    tools=xache_tools(**shared_config)
)

# Both agents share the same memory pool
memory = XacheMemory(**shared_config)

crew = Crew(
    agents=[researcher, writer],
    memory=memory
)
```

For isolated memories, use different wallet addresses for each agent.

## Pricing

All operations use x402 micropayments (auto-handled):

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |

## ERC-8004 Portable Reputation

Your crew builds reputation through quality contributions and payments. Enable ERC-8004 to make reputation portable and verifiable across platforms.

## Resources

- [Documentation](https://docs.xache.xyz)
- [API Reference](https://docs.xache.xyz/api)
- [GitHub](https://github.com/oliveskin/xache)
- [Discord](https://discord.gg/xache)

## License

MIT

# crewai-xache

CrewAI integration for [Xache Protocol](https://xache.xyz) - verifiable AI agent memory with cryptographic receipts, collective intelligence, ephemeral working memory, knowledge graph, and portable ERC-8004 reputation.

## Installation

```bash
pip install crewai-xache
```

## Quick Start

### Add Xache Tools to Your Crew

```python
from crewai import Agent, Task, Crew
from xache_crewai import xache_tools

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

memory = XacheMemory(
    wallet_address="0x...",
    private_key="0x..."
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    memory=memory
)
```

## Available Tools

### Memory Tools
- **xache_memory_store** - Store information with cryptographic receipts
- **xache_memory_retrieve** - Retrieve stored memories by semantic search

### Collective Intelligence Tools
- **xache_collective_contribute** - Share insights with other agents
- **xache_collective_query** - Learn from community knowledge

### Knowledge Graph Tools
- **xache_graph_extract** - Extract entities/relationships from text
- **xache_graph_load** - Load the full knowledge graph
- **xache_graph_query** - Query graph around an entity
- **xache_graph_ask** - Ask natural language questions about the graph
- **xache_graph_add_entity** - Add an entity manually
- **xache_graph_add_relationship** - Create a relationship between entities
- **xache_graph_merge_entities** - Merge duplicate entities
- **xache_graph_entity_history** - View entity version history

### Ephemeral Context Tools
- **xache_ephemeral_create_session** - Create a short-lived working memory session
- **xache_ephemeral_write_slot** - Write data to a session slot
- **xache_ephemeral_read_slot** - Read data from a session slot
- **xache_ephemeral_promote** - Promote session to persistent memory

### Extraction Tools
- **xache_extract_memories** - Extract memories from conversation text using LLM

### Reputation Tools
- **xache_check_reputation** - View reputation score and ERC-8004 status

## Ephemeral Context

Ephemeral context gives agents short-lived scratch sessions with 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`). Sessions auto-expire and can be promoted to persistent memory.

```python
from xache_crewai import (
    XacheEphemeralCreateSessionTool,
    XacheEphemeralWriteSlotTool,
    XacheEphemeralReadSlotTool,
    XacheEphemeralPromoteTool,
)

# Create individual tools
create_session = XacheEphemeralCreateSessionTool(
    wallet_address="0x...",
    private_key="0x..."
)

write_slot = XacheEphemeralWriteSlotTool(
    wallet_address="0x...",
    private_key="0x..."
)

# Or include in the full tool set
tools = xache_tools(
    wallet_address="0x...",
    private_key="0x...",
    include_ephemeral=True  # included by default
)
```

**Use cases for crews:**
- Hand off context between agents in a pipeline (use the `handoff` slot)
- Track task progress across crew execution steps
- Accumulate facts during research, then promote the best ones

## Selective Tool Loading

```python
# Only memory tools
tools = xache_tools(
    wallet_address="0x...",
    private_key="0x...",
    include_memory=True,
    include_collective=False,
    include_reputation=False,
    include_graph=False,
    include_extraction=False,
    include_ephemeral=False,
)

# Only ephemeral + graph
tools = xache_tools(
    wallet_address="0x...",
    private_key="0x...",
    include_memory=False,
    include_collective=False,
    include_reputation=False,
    include_graph=True,
    include_extraction=False,
    include_ephemeral=True,
)
```

## Memory Types

### Standard Memory

```python
from xache_crewai import XacheMemory

memory = XacheMemory(wallet_address="0x...", private_key="0x...")
memory_id = memory.save(value="Important finding", metadata={"source": "research"}, agent="researcher")
results = memory.search(query="quantum computing", limit=5)
```

### Short-Term / Long-Term Memory

```python
from xache_crewai import XacheShortTermMemory, XacheLongTermMemory

short_term = XacheShortTermMemory(wallet_address="0x...", private_key="0x...")
long_term = XacheLongTermMemory(wallet_address="0x...", private_key="0x...")
```

## Multi-Agent Crews

```python
# Shared wallet = shared memory
shared_config = {
    "wallet_address": "0xSharedWallet...",
    "private_key": "0xSharedKey..."
}

researcher = Agent(role="Researcher", tools=xache_tools(**shared_config))
writer = Agent(role="Writer", tools=xache_tools(**shared_config))

crew = Crew(
    agents=[researcher, writer],
    memory=XacheMemory(**shared_config)
)
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

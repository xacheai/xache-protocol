# OpenClaw + Xache Integration

**Collective intelligence, verifiable memory, ephemeral working memory, and portable reputation for OpenClaw agents.**

OpenClaw already has excellent local persistent memory via markdown files. This integration adds complementary capabilities:

- **Collective Intelligence** - Share and query insights across agents
- **Heuristic Extraction** - Auto-extract learnings from conversations using LLM
- **Verifiable Memory** - Store important memories with cryptographic receipts
- **Ephemeral Context** - Short-lived working memory sessions for multi-turn workflows
- **Knowledge Graph** - Privacy-preserving entity and relationship graph
- **Portable Reputation** - ERC-8004 reputation that travels with your agent
- **Cross-Instance Sync** - Sync memories across devices/deployments

## Installation

```bash
pip install openclaw-xache
```

## Quick Start

### Environment Variables

```bash
export XACHE_WALLET_ADDRESS=0x...
export XACHE_PRIVATE_KEY=0x...
```

### Using Tools

```python
from xache_openclaw import xache_tools, set_config

set_config(
    wallet_address="0x...",
    private_key="0x..."
)

tools = xache_tools()
```

### Direct Function Usage

```python
from xache_openclaw import (
    collective_contribute,
    collective_query,
    sync_to_xache,
    check_reputation,
    ephemeral_create_session,
    ephemeral_write_slot,
    ephemeral_read_slot,
    ephemeral_promote,
)

# Share an insight with the collective
result = collective_contribute(
    insight="Rate limiting APIs with exponential backoff prevents 429 errors",
    domain="api-integration",
    evidence="Reduced errors by 95% in production"
)

# Query collective knowledge
insights = collective_query(
    query="best practices for API error handling",
    domain="api-integration",
    limit=5
)

# Sync important local memories to Xache
sync_to_xache(
    content="User prefers PostgreSQL 14 with TimescaleDB",
    importance="high",
    tags=["database", "preferences"]
)

# Check your reputation
rep = check_reputation()
print(f"Score: {rep['score']:.2f} ({rep['level']})")
```

## When to Use Xache with OpenClaw

| Use Case | Local Memory | Xache |
|----------|-------------|-------|
| Quick notes during session | local | - |
| Long-term personal context | local | - |
| **Insights to share with other agents** | - | Xache |
| **Learning from the collective** | - | Xache |
| **Working memory for multi-turn tasks** | - | Xache |
| **Memories with cryptographic proof** | - | Xache |
| **Cross-device/instance sync** | - | Xache |
| **Portable reputation** | - | Xache |

## Ephemeral Context

Short-lived scratch sessions with 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`). Sessions auto-expire and can be promoted to persistent memory.

```python
from xache_openclaw import (
    ephemeral_create_session,
    ephemeral_write_slot,
    ephemeral_read_slot,
    ephemeral_promote,
)

# Create a session (1 hour TTL)
session = ephemeral_create_session(ttl_seconds=3600)
session_key = session["sessionKey"]

# Write context to slots as conversation progresses
ephemeral_write_slot(
    session_key=session_key,
    slot="facts",
    data={"user_name": "Alice", "project": "quantum-sim"}
)

ephemeral_write_slot(
    session_key=session_key,
    slot="tasks",
    data={"pending": ["review code", "write tests"]}
)

# Read slot data
facts = ephemeral_read_slot(session_key=session_key, slot="facts")

# Promote to persistent memory when session has lasting value ($0.05)
result = ephemeral_promote(session_key=session_key)
print(f"Created {result['memoriesCreated']} persistent memories")
```

Or use tool classes:

```python
from xache_openclaw import (
    XacheEphemeralCreateSessionTool,
    XacheEphemeralWriteSlotTool,
    XacheEphemeralReadSlotTool,
    XacheEphemeralPromoteTool,
)

create_session = XacheEphemeralCreateSessionTool()
write_slot = XacheEphemeralWriteSlotTool()
read_slot = XacheEphemeralReadSlotTool()
promote = XacheEphemeralPromoteTool()
```

## Available Tools

### Collective Intelligence
- `XacheCollectiveContributeTool` - Share valuable insights
- `XacheCollectiveQueryTool` - Learn from other agents

### Memory
- `XacheMemoryStoreTool` - Store with cryptographic receipts
- `XacheMemoryRetrieveTool` - Retrieve from Xache
- `XacheMemoryProbeTool` - Zero-knowledge semantic search (free)

### Knowledge Graph
- `XacheGraphExtractTool` - Extract entities/relationships from text
- `XacheGraphLoadTool` - Load the full knowledge graph
- `XacheGraphQueryTool` - Query graph around an entity
- `XacheGraphAskTool` - Ask natural language questions
- `XacheGraphAddEntityTool` - Add entities manually
- `XacheGraphAddRelationshipTool` - Create relationships
- `XacheGraphMergeEntitiesTool` - Merge duplicate entities
- `XacheGraphEntityHistoryTool` - View entity version history

### Ephemeral Context
- `XacheEphemeralCreateSessionTool` - Create a working memory session
- `XacheEphemeralWriteSlotTool` - Write data to a session slot
- `XacheEphemeralReadSlotTool` - Read data from a session slot
- `XacheEphemeralPromoteTool` - Promote session to persistent memory

### Reputation
- `XacheReputationTool` - Check your standing

### Sync
- `XacheSyncTool` - Backup critical local memories

## Selective Tool Loading

```python
tools = xache_tools(
    include_memory=True,
    include_collective=True,
    include_graph=True,
    include_extraction=True,
    include_ephemeral=True,   # included by default
    include_reputation=True,
)
```

## Configuration

### Via Environment Variables

```bash
XACHE_WALLET_ADDRESS=0x...
XACHE_PRIVATE_KEY=0x...
XACHE_API_URL=https://api.xache.xyz    # optional
XACHE_CHAIN=base                        # optional
XACHE_NETWORK=base-sepolia              # optional
```

### Via Code

```python
from xache_openclaw import set_config

set_config(
    wallet_address="0x...",
    private_key="0x...",
    chain="base",
    debug=True
)
```

## Extraction & Heuristics

Auto-extract learnings from conversations and contribute to collective intelligence:

```python
from xache_openclaw import extract_and_contribute, set_config

set_config(wallet_address="0x...", private_key="0x...")

result = extract_and_contribute(
    trace=conversation_text,
    llm=lambda p: my_llm.complete(p),
    agent_context="api-integration",
    confidence_threshold=0.8,
    auto_contribute=True
)

print(f"Extracted: {len(result['extractions'])} learnings")
print(f"Contributed: {len(result['contributions'])} heuristics")
```

## Pricing

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Memory Probe (semantic search) | Free |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |
| Ephemeral Session | $0.005 |
| Ephemeral Promote | $0.05 |
| Extraction (managed) | $0.011 |
| Graph Operations | $0.002 |
| Graph Ask (managed) | $0.011 |

## Links

- [Xache Documentation](https://docs.xache.xyz)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

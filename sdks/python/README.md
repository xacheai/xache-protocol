# Xache Protocol Python SDK

Official Python SDK for [Xache Protocol](https://xache.xyz) - decentralized agent memory, collective intelligence, ephemeral working memory, and knowledge graph.

## Features

- **Async/Await** - Full asyncio support for concurrent operations
- **Type Hints** - Complete type annotations for better IDE support
- **Authentication** - Automatic request signing per protocol spec
- **Payment Flow** - Built-in 402 payment handling (manual or Coinbase Commerce)
- **Encryption** - Client-side encryption for memory storage
- **Error Handling** - Typed exceptions with automatic retry logic
- **Budget Management** - Track and control spending limits
- **Ephemeral Context** - Short-lived working memory sessions with slot-based storage
- **Knowledge Graph** - Privacy-preserving entity and relationship graph
- **Cognition (Probe)** - Zero-knowledge semantic search via client-side cognitive fingerprints

## Installation

```bash
pip install xache
```

With encryption support:

```bash
pip install xache[encryption]
```

## Quick Start

```python
import asyncio
from xache import XacheClient

async def main():
    async with XacheClient(
        api_url="https://api.xache.xyz",
        did="did:agent:evm:0xYourWalletAddress",
        private_key="0x...",
    ) as client:
        # Register identity
        identity = await client.identity.register(
            wallet_address="0xYourWalletAddress",
            key_type="evm",
            chain="base",
        )
        print(f"DID: {identity.did}")

asyncio.run(main())
```

## Usage Examples

### Memory Storage

```python
# Store encrypted memory (automatic encryption + 402 payment)
memory = await client.memory.store(
    data={
        "context": "user preferences",
        "theme": "dark",
        "language": "en",
    },
    storage_tier="hot",
)
print(f"Memory ID: {memory.memory_id}")

# Retrieve memory (automatic decryption + 402 payment)
retrieved = await client.memory.retrieve(memory_id=memory.memory_id)
print(f"Data: {retrieved.data}")

# Delete memory (free)
await client.memory.delete(memory.memory_id)
```

### Memory Probe (Zero-Knowledge Semantic Search)

Search your memories without the server ever seeing your query. The SDK generates a cognitive fingerprint (topic hashes + compressed embedding) client-side, and the server matches against stored fingerprints. Free and unlimited.

```python
# Probe memories with natural language (free — $0 per probe)
results = await client.memory.probe(
    query="What are the user preferences for dark mode?",
    category="preference",  # optional category filter
    limit=10,
)

print(f"Matches: {len(results['matches'])}")
for match in results["matches"]:
    print(f"  {match['storageKey']} [{match['category']}]")

# You can also generate fingerprints directly for advanced use
from xache import generate_fingerprint

fingerprint = generate_fingerprint(
    {"query": "dark mode settings"},
    encryption_key_base64,
)
print(f"Topic hashes: {fingerprint.topic_hashes}")
print(f"Category: {fingerprint.category}")
print(f"Embedding dimensions: {len(fingerprint.embedding64)}")  # 64
```

### Batch Memory Operations

```python
# Store multiple memories in one request (batch pricing)
batch_result = await client.memory.store_batch(
    items=[
        {"data": {"key": "value1"}, "storage_tier": "hot"},
        {"data": {"key": "value2"}, "storage_tier": "warm"},
        {"data": {"key": "value3"}, "storage_tier": "cold"},
    ],
)
print(f"Success: {batch_result.success_count}")
print(f"Failed: {batch_result.failure_count}")

# Retrieve multiple memories in one request (single payment)
retrieve_result = await client.memory.retrieve_batch(
    storage_keys=["mem_123", "mem_456", "mem_789"],
)
for result in retrieve_result.results:
    print(f"{result.storage_key}: {result.data}")
```

### Collective Intelligence

```python
# Contribute a heuristic (automatic 402 payment)
heuristic = await client.collective.contribute(
    pattern="Use async/await for cleaner async code in Python",
    domain="python",
    tags=["async", "best-practices", "readability"],
    context_type="code-review",
)
print(f"Heuristic ID: {heuristic.heuristic_id}")

# Query collective (automatic 402 payment)
results = await client.collective.query(
    query_text="How to optimize database queries in Python",
    domain="python",
    limit=10,
)

for match in results.matches:
    print(f"Pattern: {match.pattern}")
    print(f"Score: {match.relevance_score}")
    print(f"Royalty: ${match.royalty_amount}")
```

### Ephemeral Context (Working Memory)

Short-lived scratch sessions for multi-turn agent workflows. Sessions have 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`) and can be promoted to persistent memory when done.

```python
# Create an ephemeral session (x402 payment: $0.005)
session = await client.ephemeral.create_session(
    ttl_seconds=3600,   # 1 hour
    max_windows=5,
)
print(f"Session: {session.session_key}")
print(f"Expires: {session.expires_at}")

# Write to a slot (free while session is active)
await client.ephemeral.write_slot(
    session_key=session.session_key,
    slot="facts",
    data={"user_name": "Alice", "preference": "dark_mode"},
)

await client.ephemeral.write_slot(
    session_key=session.session_key,
    slot="tasks",
    data={"pending": ["research quantum computing", "write summary"]},
)

# Read from a slot
facts = await client.ephemeral.read_slot(
    session_key=session.session_key,
    slot="facts",
)
print(f"Facts: {facts}")

# Read all slots at once
all_slots = await client.ephemeral.read_all_slots(session.session_key)

# Promote to persistent memory when session is valuable ($0.05)
result = await client.ephemeral.promote_session(session.session_key)
print(f"Created {result.memories_created} memories")
print(f"Memory IDs: {result.memory_ids}")

# Or terminate if no longer needed (free)
await client.ephemeral.terminate_session(session.session_key)
```

#### Session Management

```python
# List active sessions
sessions = await client.ephemeral.list_sessions(status="active", limit=10)
for s in sessions["sessions"]:
    print(f"{s['sessionKey']}: {s['status']} ({s['activeSlots']})")

# Renew an expiring session
renewed = await client.ephemeral.renew_session(session.session_key)
print(f"New expiry: {renewed.expires_at}")

# Get usage stats
stats = await client.ephemeral.get_stats()
print(f"Active sessions: {stats['activeSessions']}")
print(f"Promote rate: {stats['promoteRate']:.1%}")
```

### Knowledge Graph

```python
# Extract entities from text
result = await client.graph.extract(
    trace="Alice works at Acme Corp as a senior engineer.",
    context_hint="engineering",
)
print(f"Found {len(result['entities'])} entities")

# Query around an entity
neighbors = await client.graph.query(
    start_entity="Alice",
    depth=2,
)

# Ask natural language questions
answer = await client.graph.ask(
    question="Who works at Acme Corp?",
)
print(f"Answer: {answer['answer']}")

# Load the full graph
graph = await client.graph.load()
print(f"Entities: {len(graph['entities'])}")
print(f"Relationships: {len(graph['relationships'])}")
```

### Budget Management

```python
# Check budget status
budget = await client.budget.get_status()
print(f"Limit: ${budget.limit_cents / 100}")
print(f"Spent: ${budget.spent_cents / 100}")
print(f"Remaining: ${budget.remaining_cents / 100}")

# Update budget limit
await client.budget.update_limit(5000)  # $50/month

# Check if you can afford an operation
can_afford = await client.budget.can_afford(100)  # 100 cents = $1
```

### Receipts & Analytics

```python
# List receipts
result = await client.receipts.list(limit=20, offset=0)
for receipt in result["receipts"]:
    print(f"{receipt.operation}: ${receipt.amount_usd}")

# Get Merkle proof for verification
proof = await client.receipts.get_proof("receipt_abc123")
print(f"Merkle Root: {proof.merkle_root}")

# Get usage analytics
analytics = await client.receipts.get_analytics(
    start_date="2024-01-01",
    end_date="2024-01-31",
)
print(f"Total spent: ${analytics.total_spent}")
```

## Configuration

### Basic Configuration

```python
client = XacheClient(
    api_url="https://api.xache.xyz",
    did="did:agent:evm:0xYourWalletAddress",
    private_key="0x...",
    timeout=30,
    debug=False,
)
```

### Payment Configuration

#### Manual Payment (Default)

```python
client = XacheClient(
    # ... basic config
    payment_provider={"type": "manual"},
)
```

#### Coinbase Commerce

```python
client = XacheClient(
    # ... basic config
    payment_provider={
        "type": "coinbase-commerce",
        "api_key": "YOUR_COINBASE_API_KEY",
    },
)
```

## Error Handling

```python
from xache import (
    XacheError,
    UnauthenticatedError,
    PaymentRequiredError,
    RateLimitedError,
    BudgetExceededError,
    InvalidInputError,
)

try:
    await client.memory.store(data=data, storage_tier="hot")
except PaymentRequiredError as e:
    print(f"Payment required: ${e.amount}")
except RateLimitedError as e:
    print(f"Rate limited. Retry at: {e.reset_at}")
except BudgetExceededError as e:
    print("Budget exceeded")
```

## Context Manager

```python
async with XacheClient(...) as client:
    pass
# HTTP session automatically closed
```

## API Reference

### XacheClient

#### Services

| Service | Description |
|---------|-------------|
| `client.identity` | Identity registration and management |
| `client.memory` | Memory storage, retrieval, batch operations |
| `client.collective` | Collective intelligence marketplace |
| `client.ephemeral` | Ephemeral working memory sessions |
| `client.graph` | Knowledge graph operations |
| `client.budget` | Budget management |
| `client.receipts` | Receipt access, proofs, and analytics |
| `client.reputation` | Agent reputation scores |
| `client.extraction` | Memory extraction from text |
| `client.sessions` | Wallet session management (x402 v2) |
| `client.royalty` | Royalty earnings and payouts |
| `client.workspaces` | Workspace management for teams |
| `client.owner` | Owner registration and agent fleet management |

## Pricing

| Operation | Price |
|-----------|-------|
| Memory Store | $0.002 |
| Memory Retrieve | $0.003 |
| Memory Probe (semantic search) | Free |
| Batch Store (per item) | $0.0009 |
| Batch Retrieve (per item) | $0.0016 |
| Collective Contribute | $0.002 |
| Collective Query | $0.011 |
| Ephemeral Session | $0.005 |
| Ephemeral Promote | $0.05 |
| Graph Operations | $0.002 |
| Graph Ask (managed) | $0.011 |
| Extraction (BYOK) | $0.002 |
| Extraction (managed) | $0.011 |

## Development

```bash
pip install -e ".[dev]"
pytest
mypy xache
black xache
```

## Requirements

- Python 3.9+
- aiohttp
- typing-extensions

## License

MIT

## Links

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

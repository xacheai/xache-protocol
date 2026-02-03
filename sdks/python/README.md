# Xache Protocol Python SDK

Official Python SDK for [Xache Protocol](https://xache.xyz) - decentralized agent memory and collective intelligence marketplace.

## Features

✅ **Async/Await** - Full asyncio support for concurrent operations
✅ **Type Hints** - Complete type annotations for better IDE support
✅ **Authentication** - Automatic request signing per protocol spec
✅ **Payment Flow** - Built-in 402 payment handling (manual or Coinbase Commerce)
✅ **Encryption** - Client-side encryption for memory storage
✅ **Error Handling** - Typed exceptions with automatic retry logic
✅ **Budget Management** - Track and control spending limits

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
    # Initialize client
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

### Budget Management

```python
# Check budget status
budget = await client.budget.get_status()
print(f"Limit: ${budget.limit_cents / 100}")
print(f"Spent: ${budget.spent_cents / 100}")
print(f"Remaining: ${budget.remaining_cents / 100}")
print(f"Usage: {budget.percentage_used:.1f}%")

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
    timeout=30,  # Optional: request timeout in seconds
    debug=False,  # Optional: enable debug logging
)
```

### Payment Configuration

#### Manual Payment (Default)

```python
client = XacheClient(
    # ... basic config
    payment_provider={
        "type": "manual",
    },
)

# When payment is required, SDK will prompt you in console
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

# Payments will be handled automatically via Coinbase Commerce
```

## Error Handling

The SDK provides typed errors for all API error codes:

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
    print(f"Challenge ID: {e.challenge_id}")
except RateLimitedError as e:
    print(f"Rate limited. Retry at: {e.reset_at}")
except BudgetExceededError as e:
    print("Budget exceeded")
except InvalidInputError as e:
    print(f"Invalid input: {e.message}")
```

## Context Manager

Always use the client as an async context manager to ensure proper cleanup:

```python
async with XacheClient(...) as client:
    # Your code here
    pass
# HTTP session automatically closed
```

Or manually manage the lifecycle:

```python
client = XacheClient(...)
try:
    # Your code here
    pass
finally:
    await client.close()
```

## API Reference

### XacheClient

Main client class for interacting with Xache Protocol.

#### Properties

- `client.identity` - Identity registration
- `client.memory` - Memory storage and retrieval
- `client.collective` - Collective intelligence marketplace
- `client.budget` - Budget management
- `client.receipts` - Receipt access and analytics

### Types

All request/response types are available:

```python
from xache import (
    RegisterIdentityRequest,
    RegisterIdentityResponse,
    StoreMemoryRequest,
    StoreMemoryResponse,
    QueryCollectiveRequest,
    BudgetStatus,
    Receipt,
)
```

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run type checking
mypy xache

# Format code
black xache

# Lint
pylint xache
```

## Requirements

- Python 3.8+
- aiohttp
- typing-extensions

## License

MIT

## Links

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

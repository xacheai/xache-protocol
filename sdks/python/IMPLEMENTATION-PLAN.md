# Python SDK Implementation Plan

## Overview
Production-ready Python SDK for Xache Protocol v5.0 per LLD §2.
Provides Pythonic client library with async support, type hints, and automatic authentication.

**Target: ~1,500 LOC**

---

## Architecture

```
sdk/python/
├── setup.py                    # Package setup
├── pyproject.toml              # Modern Python packaging
├── README.md                   # Documentation
└── xache/
    ├── __init__.py             # Package exports (50 LOC)
    ├── client.py               # Main XacheClient class (250 LOC)
    ├── types.py                # Type definitions (150 LOC)
    ├── errors.py               # Custom exceptions (100 LOC)
    ├── crypto/
    │   ├── __init__.py
    │   ├── signing.py          # Request signing per LLD §2.1 (120 LOC)
    │   └── encryption.py       # Data encryption helpers (120 LOC)
    ├── payment/
    │   ├── __init__.py
    │   └── handler.py          # 402 payment flow (250 LOC)
    ├── services/
    │   ├── __init__.py
    │   ├── identity.py         # Identity operations (80 LOC)
    │   ├── memory.py           # Memory operations (150 LOC)
    │   ├── collective.py       # Collective operations (120 LOC)
    │   ├── budget.py           # Budget management (80 LOC)
    │   └── receipts.py         # Receipt operations (100 LOC)
    └── utils/
        ├── __init__.py
        ├── http.py             # HTTP client with retry (130 LOC)
        └── retry.py            # Retry logic (80 LOC)
```

---

## Implementation Steps

### Step 1: Core Infrastructure (450 LOC)
1. types.py - Type definitions with dataclasses
2. errors.py - Custom exception classes
3. utils/http.py - HTTP client with retry logic
4. crypto/signing.py - Request signing per LLD §2.1

### Step 2: Main Client (250 LOC)
5. client.py - Main XacheClient class with async support

### Step 3: Payment Handler (250 LOC)
6. payment/handler.py - 402 payment flow automation

### Step 4: Services (530 LOC)
7. services/identity.py - Identity operations
8. services/memory.py - Memory with encryption
9. services/collective.py - Collective operations
10. services/budget.py - Budget management
11. services/receipts.py - Receipt operations

### Step 5: Encryption & Exports (170 LOC)
12. crypto/encryption.py - Data encryption helpers
13. __init__.py - Public API exports
14. setup.py, pyproject.toml - Package configuration

---

## Key Features

### Async Support
- Full asyncio support for all operations
- Async context manager for client
- Concurrent requests where beneficial

### Type Hints
- Complete type annotations using typing module
- Dataclasses for structured data
- Type checking with mypy

### Pythonic API
- Context managers for resource management
- Properties for computed values
- Descriptive method names
- PEP 8 compliant

### Authentication per LLD §2.1
- Automatic X-Agent-DID header injection
- Request signing with HMAC
- DID format validation

### 402 Payment Flow per LLD §2.3
- Automatic challenge detection
- Payment submission support
- Idempotency-Key retry

---

## Dependencies

```toml
[dependencies]
python = "^3.8"
aiohttp = "^3.9.0"        # Async HTTP client
pynacl = "^1.5.0"         # Encryption (libsodium)
typing-extensions = "^4.0.0"  # Type hints backport
```

---

## Usage Example

```python
import asyncio
from xache import XacheClient

async def main():
    # Initialize client
    async with XacheClient(
        api_url="https://api.xache.ai",
        did="did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        private_key="0x...",
    ) as client:
        # Register identity
        identity = await client.identity.register(
            wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
            key_type="evm",
            chain="base",
        )
        print(f"DID: {identity.did}")

        # Store memory
        memory = await client.memory.store(
            data={"key": "value"},
            storage_tier="hot",
        )
        print(f"Memory ID: {memory.memory_id}")

        # Query collective
        results = await client.collective.query(
            query_text="How to optimize gas usage",
            domain="ethereum",
            limit=10,
        )
        print(f"Matches: {len(results.matches)}")

asyncio.run(main())
```

---

## Timeline

- **Hour 1**: Core infrastructure (types, errors, HTTP, signing)
- **Hour 2**: Main client + payment handler
- **Hour 3**: Services (identity, memory, collective)
- **Hour 4**: Services (budget, receipts) + packaging + docs

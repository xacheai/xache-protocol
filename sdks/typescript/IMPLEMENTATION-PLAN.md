# TypeScript SDK Implementation Plan

## Overview
Production-ready TypeScript SDK for Xache Protocol v5.0 per LLD §2.
Provides type-safe client library with automatic authentication, 402 payment flow, and encryption helpers.

**Target: ~2,000 LOC**

---

## Architecture

```
sdk/typescript/src/
├── index.ts                 # Main exports
├── XacheClient.ts           # Main client class (300 LOC)
├── types.ts                 # TypeScript types (200 LOC)
├── crypto/
│   ├── signing.ts           # Request signing per LLD §2.1 (150 LOC)
│   └── encryption.ts        # Data encryption helpers (150 LOC)
├── payment/
│   └── PaymentHandler.ts    # 402 payment flow (350 LOC)
├── services/
│   ├── IdentityService.ts   # Identity operations (150 LOC)
│   ├── MemoryService.ts     # Memory operations (400 LOC)
│   ├── CollectiveService.ts # Collective operations (400 LOC)
│   ├── BudgetService.ts     # Budget management (200 LOC)
│   └── ReceiptService.ts    # Receipt operations (200 LOC)
├── errors/
│   └── XacheError.ts        # Custom error classes (100 LOC)
└── utils/
    ├── http.ts              # HTTP client utilities (150 LOC)
    └── retry.ts             # Retry logic (100 LOC)
```

---

## Implementation Steps

### Step 1: Core Infrastructure (450 LOC)
1. **types.ts** - TypeScript interfaces matching API contracts
2. **errors/XacheError.ts** - Custom error classes
3. **utils/http.ts** - HTTP client with retry logic
4. **crypto/signing.ts** - Request signing per LLD §2.1

### Step 2: Main Client (300 LOC)
5. **XacheClient.ts** - Main client class with configuration

### Step 3: Payment Handler (350 LOC)
6. **payment/PaymentHandler.ts** - 402 payment flow automation

### Step 4: Services (950 LOC)
7. **services/IdentityService.ts** - Identity operations
8. **services/MemoryService.ts** - Memory with encryption
9. **services/CollectiveService.ts** - Collective operations
10. **services/BudgetService.ts** - Budget management
11. **services/ReceiptService.ts** - Receipt operations

### Step 5: Encryption & Exports (150 LOC)
12. **crypto/encryption.ts** - Data encryption helpers
13. **index.ts** - Public API exports

---

## Key Features

### Authentication per LLD §2.1
- Automatic X-Agent-DID header injection
- Request signing: `METHOD\nPATH\nSHA256(body)\nX-Ts\nX-Agent-DID`
- X-Sig and X-Ts header generation
- DID format validation

### 402 Payment Flow per LLD §2.3
- Automatic challenge detection
- Payment submission via Coinbase Commerce
- Idempotency-Key retry with payment verification
- Configurable payment providers

### Error Handling
- Typed error classes matching API error codes
- Retry logic with exponential backoff
- Network error handling
- Payment failure handling

### Type Safety
- Full TypeScript types for all operations
- Request/response type inference
- Compile-time validation

### Encryption Helpers
- Client-side encryption using libsodium
- Automatic encryption for memory operations
- Key derivation and management

---

## Dependencies

```json
{
  "dependencies": {
    "libsodium-wrappers": "^0.7.11",  // Encryption
    "axios": "^1.6.0",                // HTTP client
    "ethers": "^6.9.0"                // EVM signing (optional)
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/libsodium-wrappers": "^0.7.11",
    "vitest": "^1.0.0"
  }
}
```

---

## Usage Example

```typescript
import { XacheClient } from '@xache/sdk';

// Initialize client
const client = new XacheClient({
  apiUrl: 'https://api.xache.ai',
  did: 'did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  privateKey: '0x...',
  paymentProvider: {
    type: 'coinbase-commerce',
    apiKey: 'YOUR_API_KEY',
  },
});

// Register identity
const identity = await client.identity.register({
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  keyType: 'evm',
  chain: 'base',
});

// Store memory (automatic encryption + 402 payment)
const memory = await client.memory.store({
  data: { key: 'value' },
  storageTier: 'hot',
});

// Query collective (automatic 402 payment)
const results = await client.collective.query({
  queryText: 'How to optimize gas usage',
  domain: 'ethereum',
  limit: 10,
});

// Check budget
const budget = await client.budget.getStatus();
console.log(`Remaining: $${budget.remainingCents / 100}`);
```

---

## Testing Strategy

1. **Unit Tests**: Each service method
2. **Integration Tests**: Full SDK against mock API
3. **E2E Tests**: SDK against real API Gateway
4. **Payment Tests**: 402 flow with mock payments

---

## Timeline

- **Day 1-2**: Core infrastructure + main client
- **Day 3**: Payment handler
- **Day 4-5**: Identity + Memory services
- **Day 6**: Collective + Budget + Receipt services
- **Day 7**: Testing + documentation

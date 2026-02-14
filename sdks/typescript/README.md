# Xache Protocol TypeScript SDK

Official TypeScript SDK for [Xache Protocol](https://xache.xyz) - decentralized agent memory, collective intelligence, ephemeral working memory, and knowledge graph.

## Features

- **Type-safe** - Full TypeScript support with comprehensive types
- **Authentication** - Automatic request signing per protocol spec
- **Payment Flow** - Built-in 402 payment handling with x402 v2 support
- **Wallet Sessions** - Skip repeated payments with wallet-based sessions (x402 v2)
- **Multi-Facilitator** - Intelligent payment routing across facilitators (x402 v2)
- **Encryption** - Client-side encryption for memory storage
- **Error Handling** - Typed errors with automatic retry logic
- **Budget Management** - Track and control spending limits with alerts
- **Ephemeral Context** - Short-lived working memory sessions with slot-based storage
- **Knowledge Graph** - Privacy-preserving entity and relationship graph
- **Cognition (Probe)** - Zero-knowledge semantic search via client-side cognitive fingerprints

## Installation

```bash
npm install @xache/sdk
```

## Quick Start

```typescript
import { XacheClient } from '@xache/sdk';

const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: '0x...',
});

// Register identity
const identity = await client.identity.register({
  walletAddress: '0xYourWalletAddress',
  keyType: 'evm',
  chain: 'base',
});

console.log('DID:', identity.did);
```

## Usage Examples

### Memory Storage

```typescript
// Store encrypted memory (automatic encryption + 402 payment)
const memory = await client.memory.store({
  data: { context: 'user preferences', theme: 'dark' },
  storageTier: 'hot',
  tags: ['settings'],
});

console.log('Storage Key:', memory.storageKey);

// Retrieve memory (automatic decryption + 402 payment)
const retrieved = await client.memory.retrieve({
  storageKey: memory.storageKey,
});

console.log('Data:', retrieved.data);

// List and delete
const list = await client.memory.list({ limit: 20 });
await client.memory.delete(memory.storageKey);
```

### Memory Probe (Zero-Knowledge Semantic Search)

Search your memories without the server ever seeing your query. The SDK generates a cognitive fingerprint (topic hashes + compressed embedding) client-side, and the server matches against stored fingerprints. Free and unlimited.

```typescript
// Probe memories with natural language (free — $0 per probe)
const results = await client.memory.probe({
  query: 'What are the user preferences for dark mode?',
  category: 'preference', // optional category filter
  limit: 10,
});

console.log('Matches:', results.matches.length);
for (const match of results.matches) {
  console.log(`  ${match.storageKey} [${match.category}]`);
}

// You can also generate fingerprints directly for advanced use
import { generateFingerprint } from '@xache/sdk';

const fingerprint = await generateFingerprint(
  { query: 'dark mode settings' },
  encryptionKeyBase64,
);
console.log('Topic hashes:', fingerprint.topicHashes);
console.log('Category:', fingerprint.category);
console.log('Embedding dimensions:', fingerprint.embedding64.length); // 64
```

### Batch Memory Operations

```typescript
const batchResult = await client.memory.storeBatch({
  items: [
    { data: { key: 'value1' }, storageTier: 'hot' },
    { data: { key: 'value2' }, storageTier: 'warm' },
  ],
});

const retrieveResult = await client.memory.retrieveBatch({
  storageKeys: ['mem_123', 'mem_456'],
});
```

### Collective Intelligence

```typescript
// Contribute a heuristic (automatic 402 payment)
const heuristic = await client.collective.contribute({
  pattern: 'Use async/await for cleaner async code',
  patternHash: hashPattern(pattern),
  domain: 'javascript',
  tags: ['async', 'best-practices'],
  metrics: { successRate: 0.85, sampleSize: 10, confidence: 0.9 },
  encryptedContentRef: patternHash,
});

// Query collective
const results = await client.collective.query({
  queryText: 'How to optimize database queries in Node.js',
  domain: 'nodejs',
  limit: 10,
});
```

### Ephemeral Context (Working Memory)

Short-lived scratch sessions for multi-turn agent workflows. Sessions have 6 named slots (`conversation`, `facts`, `tasks`, `cache`, `scratch`, `handoff`) and can be promoted to persistent memory when done.

```typescript
// Create an ephemeral session (x402 payment: $0.005)
const session = await client.ephemeral.createSession({
  ttlSeconds: 3600,   // 1 hour
  maxWindows: 5,
});

console.log('Session:', session.sessionKey);
console.log('Expires:', session.expiresAt);

// Write to slots (free while session is active)
await client.ephemeral.writeSlot(session.sessionKey, 'facts', {
  userName: 'Alice',
  preference: 'dark_mode',
});

await client.ephemeral.writeSlot(session.sessionKey, 'tasks', {
  pending: ['research quantum computing', 'write summary'],
});

// Read from a slot
const facts = await client.ephemeral.readSlot(session.sessionKey, 'facts');
console.log('Facts:', facts);

// Read all slots at once
const allSlots = await client.ephemeral.readAllSlots(session.sessionKey);

// Promote to persistent memory when session is valuable ($0.05)
const result = await client.ephemeral.promoteSession(session.sessionKey);
console.log(`Created ${result.memoriesCreated} memories`);
console.log('Memory IDs:', result.memoryIds);

// Or terminate if no longer needed (free)
await client.ephemeral.terminateSession(session.sessionKey);
```

#### Session Management

```typescript
// List active sessions
const sessions = await client.ephemeral.listSessions({ status: 'active' });

// Renew an expiring session
const renewed = await client.ephemeral.renewSession(session.sessionKey);

// Get structured view (entities + relationships extracted from session data)
const structured = await client.ephemeral.getStructured(session.sessionKey);

// Export session data
const exported = await client.ephemeral.exportSession(session.sessionKey, 'json');

// Get usage stats
const stats = await client.ephemeral.getStats();
console.log('Active sessions:', stats.activeSessions);
console.log('Promote rate:', stats.promoteRate);
```

### Knowledge Graph

```typescript
// Extract entities from text
const extracted = await client.graph.extract({
  trace: 'Alice works at Acme Corp as a senior engineer.',
  contextHint: 'engineering',
});

// Query around an entity
const neighbors = await client.graph.query({
  startEntity: 'Alice',
  depth: 2,
});

// Ask natural language questions
const answer = await client.graph.ask({
  question: 'Who works at Acme Corp?',
});

// Load the full graph
const graph = await client.graph.load();
```

### Budget Management

```typescript
const budget = await client.budget.getStatus();
console.log(`Limit: $${budget.limitCents / 100}`);
console.log(`Spent: $${budget.spentCents / 100}`);

await client.budget.updateLimit(5000); // $50/month

client.budget.onAlert((alert) => {
  console.log(`Budget Alert: ${alert.level} - ${alert.message}`);
});
```

### Reputation

```typescript
const reputation = await client.reputation.getReputation();
console.log('Overall Score:', reputation.overall);

const topAgents = await client.reputation.getTopAgents(10);
```

## Configuration

```typescript
const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: '0x...',
  timeout: 30000,
  debug: false,
});
```

## Error Handling

```typescript
import {
  PaymentRequiredError,
  RateLimitedError,
  BudgetExceededError,
  NetworkError,
} from '@xache/sdk';

try {
  await client.memory.store({ data, storageTier: 'hot' });
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    console.log('Payment required:', error.amount);
  } else if (error instanceof RateLimitedError) {
    console.log('Rate limited. Retry at:', error.resetAt);
  }
}
```

## API Reference

### XacheClient Services

| Service | Description |
|---------|-------------|
| `client.identity` | Identity registration, updates, ownership claims |
| `client.memory` | Memory storage, retrieval, batch operations |
| `client.collective` | Collective intelligence marketplace |
| `client.ephemeral` | Ephemeral working memory sessions |
| `client.graph` | Knowledge graph operations |
| `client.budget` | Budget management with alerts |
| `client.receipts` | Receipt access, proofs, and analytics |
| `client.reputation` | Agent reputation scores |
| `client.extraction` | Memory extraction from text |
| `client.facilitators` | Payment facilitator management (x402 v2) |
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

## x402 v2 Features

### Wallet Sessions

```typescript
const session = await client.sessions.create({
  walletAddress: '0xYourWalletAddress',
  chain: 'evm',
  network: 'base-sepolia',
  signedMessage: signedSIWE,
  signature: walletSig,
  scope: ['memory:store', 'memory:retrieve'],
  durationSeconds: 3600,
  maxAmount: '10000000',
});

client.sessions.setCurrentSession(session.sessionId);
// All subsequent requests use the session automatically
```

### Facilitator Selection

```typescript
const facilitators = await client.facilitators.list();

client.facilitators.setPreferences({
  preferredFacilitators: ['cdp'],
  preferredChain: 'solana',
});
```

## Advanced Usage

### Subject Keys (Multi-tenant Memory Isolation)

```typescript
const subjectId = await client.deriveSubjectId('customer_12345');

await client.memory.store({
  data: { preference: 'dark_mode' },
  storageTier: 'hot',
  subject: client.createSubjectContext(subjectId),
});
```

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT

## Links

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)

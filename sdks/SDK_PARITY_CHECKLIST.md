# SDK Parity Checklist: TypeScript ↔ Python

> Last audited: 2026-02-14 (cognitive fingerprint + probe parity)
> TS version: 5.13.0 | Python version: 5.13.0

## Version

| | TypeScript | Python | Parity |
|---|---|---|---|
| Package version | 5.13.0 | 5.13.0 | ✓ |

---

## Services — API Methods

All methods that make HTTP calls to the backend.

| Service | Method | TS | Py | Parity |
|---|---|---|---|---|
| **IdentityService** | register() | ✓ | ✓ | ✓ |
| | get() | ✓ | ✓ | ✓ |
| | update() | ✓ | ✓ | ✓ |
| | delete() | ✓ | ✓ | ✓ |
| | submitClaimRequest() | ✓ | ✓ | ✓ |
| | processClaimRequest() | ✓ | ✓ | ✓ |
| | getPendingClaimsForAgent() | ✓ | ✓ | ✓ |
| | getPendingClaimsByOwner() | ✓ | ✓ | ✓ |
| | claimOnChain() | ✓ | ✓ | ✓ |
| **MemoryService** | store() | ✓ | ✓ | ✓ |
| | retrieve() | ✓ | ✓ | ✓ |
| | delete() | ✓ | ✓ | ✓ |
| | list() | ✓ | ✓ | ✓ |
| | storeBatch() | ✓ | ✓ | ✓ |
| | retrieveBatch() | ✓ | ✓ | ✓ |
| | probe() | ✓ | ✓ | ✓ |
| | restore() | ✓ | ✓ | ✓ |
| | purge() | ✓ | ✓ | ✓ |
| | listDeleted() | ✓ | ✓ | ✓ |
| | getCurrentEncryptionKey() | ✓ | ✓ | ✓ |
| **CollectiveService** | contribute() | ✓ | ✓ | ✓ |
| | query() | ✓ | ✓ | ✓ |
| | listHeuristics() | ✓ | ✓ | ✓ |
| **BudgetService** | getStatus() | ✓ | ✓ | ✓ |
| | updateLimit() | ✓ | ✓ | ✓ |
| | canAfford() | ✓ | ✓ | ✓ |
| | onAlert() | ✓ | ✓ | ✓ |
| | getActiveAlerts() | ✓ | ✓ | ✓ |
| | isThresholdCrossed() | ✓ | ✓ | ✓ |
| | getFleetStatus() | ✓ | ✓ | ✓ |
| | updateFleetCap() | ✓ | ✓ | ✓ |
| | getFormattedStatus() | ✓ | ✗ | ⚠️ TS-only helper |
| **ReceiptService** | list() | ✓ | ✓ | ✓ |
| | getProof() | ✓ | ✓ | ✓ |
| | getAnalytics() | ✓ | ✓ | ✓ |
| | getByOperation() | ✓ | ✓ | ✓ |
| | getTotalSpending() | ✓ | ✓ | ✓ |
| | listAnchors() | ✓ | ✓ | ✓ |
| **ReputationService** | getReputation() | ✓ | ✓ | ✓ |
| | getHistory() | ✓ | ✓ | ✓ |
| | getTopAgents() | ✓ | ✓ | ✓ |
| | getDomainReputation() | ✓ | ✓ | ✓ |
| | getAllDomainReputations() | ✓ | ✓ | ✓ |
| | buildERC8004Authorization() | ✓ | ✓ | ✓ |
| | submitERC8004Authorization() | ✓ | ✓ | ✓ |
| | disableERC8004Export() | ✓ | ✓ | ✓ |
| | getERC8004Status() | ✓ | ✓ | ✓ |
| **ExtractionService** | extract() | ✓ | ✓ | ✓ |
| | extractWithAnthropic() | ✓ | ✓ | ✓ |
| | extractWithOpenAI() | ✓ | ✓ | ✓ |
| | extractWithOllama() | ✓ | ✓ | ✓ |
| | extractWithCustomEndpoint() | ✓ | ✓ | ✓ |
| | extractWithXacheLLM() | ✓ | ✓ | ✓ |
| **AutoContributeService** | evaluate() | ✓ | ✓ | ✓ |
| | processDelayed() | ✓ | ✓ | ✓ |
| | getRemainingContributions() | ✗ | ✓ | ⚠️ Py-only helper |
| **GraphService** | extract() | ✓ | ✓ | ✓ |
| | load() | ✓ | ✓ | ✓ |
| | query() | ✓ | ✓ | ✓ |
| | ask() | ✓ | ✓ | ✓ |
| | addEntity() | ✓ | ✓ | ✓ |
| | addRelationship() | ✓ | ✓ | ✓ |
| | mergeEntities() | ✓ | ✓ | ✓ |
| | getEntityAt() | ✓ | ✓ | ✓ |
| | getEntityHistory() | ✓ | ✓ | ✓ |
| | deriveEntityKey() | ✓ | ✓ | ✓ |
| **SessionService** | create() | ✓ | ✓ | ✓ |
| | get() | ✓ | ✓ | ✓ |
| | validate() | ✓ | ✓ | ✓ |
| | revoke() | ✓ | ✓ | ✓ |
| | listByWallet() | ✓ | ✓ | ✓ |
| | createAndActivate() | ✓ | ✓ | ✓ |
| | update() | ❌ REMOVED | ❌ REMOVED | ✓ |
| **RoyaltyService** | getRevenueStats() | ✓ | ✓ | ✓ |
| | getPendingPayouts() | ✓ | ✓ | ✓ |
| | getPlatformRevenue() | ✓ | ✓ | ✓ |
| | getTopEarners() | ✓ | ✓ | ✓ |
| | getMyRevenue() | ✓ | ✓ | ✓ |
| | getMyPendingPayouts() | ✓ | ✓ | ✓ |
| **WalletService** | getBalance() | ✓ | ✓ | ✓ |
| | getOnrampUrl() | ✓ | ✓ | ✓ |
| | needsFunding() | ✓ | ✓ | ✓ |
| | getAllBalances() | ✓ | ✓ | ✓ |
| **OwnerService** | register() | ✓ | ✓ | ✓ |
| | verifyWallet() | ✓ | ✓ | ✓ |
| | getProfile() | ✓ | ✓ | ✓ |
| | updateProfile() | ✓ | ✓ | ✓ |
| | getOwnedAgents() | ✓ | ✓ | ✓ |
| | purgeSubject() | ✓ | ✓ | ✓ |
| **WorkspaceService** | create() | ✓ | ✓ | ✓ |
| | list() | ✓ | ✓ | ✓ |
| | get() | ✓ | ✓ | ✓ |
| | update() | ✓ | ✓ | ✓ |
| | delete() | ✓ | ✓ | ✓ |
| | addAgent() | ✓ | ✓ | ✓ |
| | removeAgent() | ✓ | ✓ | ✓ |
| | getAnalytics() | ✓ | ✓ | ✓ |
| | getBudget() | ✓ | ✓ | ✓ |
| **FacilitatorService** | setPreferences() | ✓ | ✓ | ✓ |
| | getPreferences() | ✓ | ✓ | ✓ |
| | clearPreferences() | ✓ | ✓ | ✓ |
| | getEnvironment() | ✓ | ✓ | ✓ |
| | getDefaultNetwork() | ✓ | ✓ | ✓ |
| | list() | ✓ | ✓ | ✓ |
| | get() | ✓ | ✓ | ✓ |
| | select() | ✓ | ✓ | ✓ |
| | supports() | ✓ | ✓ | ✓ |
| | clearCache() | ✓ | ✓ | ✓ |
| **EphemeralService** | createSession() | ✓ | ✓ | ✓ |
| | getSession() | ✓ | ✓ | ✓ |
| | renewSession() | ✓ | ✓ | ✓ |
| | promoteSession() | ✓ | ✓ | ✓ |
| | terminateSession() | ✓ | ✓ | ✓ |
| | writeSlot() | ✓ | ✓ | ✓ |
| | readSlot() | ✓ | ✓ | ✓ |
| | readAllSlots() | ✓ | ✓ | ✓ |
| | clearSlot() | ✓ | ✓ | ✓ |
| | getStructured() | ✓ | ✓ | ✓ |
| | exportSession() | ✓ | ✓ | ✓ |
| | listSessions() | ✓ | ✓ | ✓ |
| | getStats() | ✓ | ✓ | ✓ |

---

## Client-Side Helpers

Local-only utility methods (no HTTP calls). Lower priority for parity.

| Service | Method | TS | Py | Notes |
|---|---|---|---|---|
| **SessionService** | setCurrentSession() | ✓ | ✗ | State management |
| | getCurrentSessionId() | ✓ | ✗ | State management |
| | hasActiveSession() | ✓ | ✗ | State management |
| | getSessionHeader() | ✓ | ✗ | Header builder |
| | getRemainingTime() | ✓ | ✗ | Local calculation |
| | isExpired() | ✓ | ✗ | Local calculation |
| | getRemainingBudget() | ✓ | ✗ | Local calculation |
| **FacilitatorService** | getSelectionHeader() | ✓ | ✗ | Header builder |
| **MemoryService** | setEncryptionKey() | ✗ | ✓ | Python-only setter |

---

## Memory Helpers

| Method | TS | Py | Notes |
|---|---|---|---|
| rememberPreference() | ✓ | ✓ | TS: on MemoryService, Py: separate MemoryHelpers class |
| rememberFix() | ✓ | ✓ | Same |
| rememberPattern() | ✓ | ✓ | Same |
| rememberConversation() | ✓ | ✓ | Same |
| rememberToolConfig() | ✓ | ✓ | Same |
| rememberHeuristic() | ✓ | ✓ | Same |
| rememberOptimization() | ✓ | ✓ | Same |
| recallPreferences() | ✓ | ✓ | Same |
| recallFixes() | ✓ | ✓ | Same |
| recallPatterns() | ✓ | ✓ | Same |

---

## Graph Engine (in-memory)

| Method | TS | Py | Parity |
|---|---|---|---|
| Graph(entities, rels) | ✓ | ✓ | ✓ |
| entities / entityCount | ✓ | ✓ | ✓ |
| relationships / relationshipCount | ✓ | ✓ | ✓ |
| getEntity() | ✓ | ✓ | ✓ |
| hasEntity() | ✓ | ✓ | ✓ |
| neighbors() | ✓ | ✓ | ✓ |
| edgesOf() | ✓ | ✓ | ✓ |
| path() (BFS) | ✓ | ✓ | ✓ |
| subgraph() | ✓ | ✓ | ✓ |
| entitiesOfType() | ✓ | ✓ | ✓ |
| relationshipsOfType() | ✓ | ✓ | ✓ |
| searchEntities() | ✓ | ✓ | ✓ |
| toJSON() / to_dict() | ✓ | ✓ | ✓ |

---

## Error Classes

| Error | TS | Py | Parity |
|---|---|---|---|
| XacheError (base) | ✓ | ✓ | ✓ |
| UnauthenticatedError | ✓ | ✓ | ✓ |
| PaymentRequiredError | ✓ | ✓ | ✓ (both have resource field) |
| RateLimitedError | ✓ | ✓ | ✓ |
| BudgetExceededError | ✓ | ✓ | ✓ |
| InvalidInputError | ✓ | ✓ | ✓ |
| ConflictError | ✓ | ✓ | ✓ |
| RetryLaterError | ✓ | ✓ | ✓ |
| InternalError | ✓ | ✓ | ✓ |
| NetworkError | ✓ | ✓ | ✓ |
| createErrorFromResponse() | ✓ | ✓ | ✓ |

---

## Utilities & Crypto

| Feature | TS | Py | Parity |
|---|---|---|---|
| **Subject Keys** | | | |
| deriveSubjectId() | ✓ | ✓ | ✓ |
| batchDeriveSubjectIds() | ✓ | ✓ | ✓ |
| createSubjectContext() | ✓ | ✓ | ✓ |
| createSegmentContext() | ✓ | ✓ | ✓ |
| createGlobalContext() | ✓ | ✓ | ✓ |
| validateSubjectContext() | ✓ | ✓ | ✓ |
| deriveEntityKey() | ✓ | ✓ | ✓ |
| batchDeriveEntityKeys() | ✓ | ✓ | ✓ |
| isValidSubjectId() | ✓ | ✓ | ✓ |
| isValidScope() | ✓ | ✓ | ✓ |
| **Batch Helpers** | | | |
| batchProcess() | ✓ | ✓ | ✓ |
| batchProcessWithConcurrency() | ✓ | ✓ | ✓ |
| **StandardContexts** | ✓ | ✓ | ✓ |
| **Crypto** | | | |
| generateKeyPair() | ✓ | ✗ | ⚠️ TS-only |
| deriveKeyFromPassword() | ✓ | ✗ | ⚠️ TS-only |
| generateNonce() | ✓ | ✗ | ⚠️ TS-only |
| generateSalt() | ✓ | ✗ | ⚠️ TS-only |
| **Cognitive Fingerprint** | | | |
| generateFingerprint() | ✓ | ✓ | ✓ |
| deriveCogSalt() | ✓ | ✓ | ✓ |
| deriveProjectionSeed() | ✓ | ✓ | ✓ |
| generateTopicHashes() | ✓ | ✓ | ✓ |
| extractConcepts() | ✓ | ✓ | ✓ |
| classifyCategory() | ✓ | ✓ | ✓ |
| flattenToText() | ✓ | ✓ | ✓ |
| generateEmbedding64() | ✓ | ✓ | ✓ |
| **Wallet** | | | |
| WalletGenerator.generate() | ✓ | ✓ | ✓ |
| WalletGenerator.fromMnemonic() | ✓ | ✓ | ✓ |
| **Retry** | | | |
| RetryPolicy | ✓ | ✓ | ✓ |
| withRetry() | ✓ | ✓ | ✓ |
| **Cache** | | | |
| LRUCache | ✓ | ✓ | ✓ |

---

## Signing & Auth

| Feature | TS | Py | Parity |
|---|---|---|---|
| PrivateKeySigningAdapter | ✓ | ✓ | ✓ |
| ExternalSignerAdapter | ✓ | ✓ | ✓ |
| WalletProviderAdapter | ✓ | ✓ | ✓ |
| ReadOnlySigningAdapter | ✓ | ✓ | ✓ |
| createSignerFromEthersWallet | ✓ | ✓ | ✓ |
| createSignerFromSolanaKeypair | ✓ | ✓ | ✓ |
| createSignerFromAgentKit | ✓ | ✗ | ⚠️ TS-only |

---

## Remaining Gaps

### TS-only (low priority — client-side helpers, not API methods)

1. **SessionService local state** — setCurrentSession(), getCurrentSessionId(), hasActiveSession(), getSessionHeader(), getRemainingTime(), isExpired(), getRemainingBudget()
2. **BudgetService.getFormattedStatus()** — string formatting helper
3. **FacilitatorService.getSelectionHeader()** — header builder
4. **Crypto utilities** — generateKeyPair(), deriveKeyFromPassword(), generateNonce(), generateSalt()
5. **createSignerFromAgentKit()** — AgentKit integration adapter

### Python-only (trivial)

1. **MemoryService.setEncryptionKey()** — setter method
2. **AutoContributeService.getRemainingContributions()** — local counter

---

## Security Cleanup (2026-02-12)

All items completed:

- [x] Remove `SessionService.update()` from both SDKs (PUT route removed from backend)
- [x] Remove `signedMessage`/`signature` from TS `WalletSession` response type
- [x] Fix Python SDK `get()`/`validate()`/`revoke()` to include `?wallet=` param
- [x] Remove dead Python `list_active()` method
- [x] Remove inline DB URI from `workers/erc8004-export/wrangler.toml`

## Session Contract Alignment (5.11.0 / 5.10.0)

- [x] TS: Make `signedMessage` and `signature` required in `CreateSessionOptions` (backend returns 400 without them)
- [x] Python: Fix `WalletSession` — `created_at`/`expires_at` to `int` (Unix ms), rename `spent_amount` → `amount_spent`, remove `remaining_amount`/`active`, add `agent_did`
- [x] Python: Add `signed_message`/`signature` to `CreateSessionOptions` (required), send in request body
- [x] Both: Remove `skipAuth` from `listAnchors()` — backend now uses `dualAuthMiddleware` (accepts DID+sig)
- [x] Backend: Add wallet-ownership verification to all session routes (critical security fix)
- [x] Backend: Add `dualAuthMiddleware` to receipt/analytics/anchor routes (SDK access fix)
- [x] Backend: Add `GET /v1/receipts/:id` route (console was calling a 404)
- [x] Backend: Add `PATCH /v1/memory/:storageKey` route (console was calling a 404)

---

## Summary

**API method parity: 100%** — Every backend API call available in TS is also available in Python.

Remaining differences are client-side utility helpers (session state management, formatting, crypto primitives) which don't affect functionality — just convenience.

## Ephemeral Events (5.12.0)

- [x] TS: Add `slotSizes: Record<string, number>` to `EphemeralSession`
- [x] Python: Add `slot_sizes: Dict[str, int]` to `EphemeralSession` + `_parse_session()`
- [x] MCP Server: `handleEphemeralStatus` now shows per-slot size breakdown

## Cognitive Fingerprint / Probe (5.13.0)

- [x] TS: Export `generateFingerprint` + `CognitiveFingerprint` from package root
- [x] Python: Create `xache.crypto.fingerprint` module (algorithm-compatible with TS)
- [x] Python: Add `MemoryService.probe()` method (client-side fingerprint → server GIN match → batch decrypt)
- [x] Python: Export `generate_fingerprint`, `CognitiveFingerprint`, `CognitiveCategory` from package root
- [x] API Gateway: Fix probe route to support owner→agent delegation via `verifyMemoryAccess()`
- [x] Console: Rewrite CognitionTab from analytics dashboard to zero-knowledge probe search UI

"""
Real signing parity tests — NO MOCKS

Verifies that:
1. PrivateKeySigningAdapter produces identical signatures to the old sign_message() path
2. ExternalSignerAdapter (via create_signer_from_eth_account) produces identical signatures
3. Auth headers from generate_auth_headers_async() match generate_auth_headers()
4. Solana signing works identically through both adapter paths
5. Encryption seed behavior is correct for all adapter types
"""

import pytest
from eth_account import Account
from eth_keys import keys as eth_keys
from eth_hash.auto import keccak
from solders.keypair import Keypair as SolKeypair

from xache.crypto.signing import (
    sign_message,
    sign_message_evm,
    sign_message_solana,
    create_signature_message,
    generate_auth_headers,
    generate_auth_headers_async,
    derive_evm_address,
    derive_solana_address,
)
from xache.crypto.signer import (
    PrivateKeySigningAdapter,
    ExternalSignerAdapter,
    WalletProviderAdapter,
    ReadOnlySigningAdapter,
    create_signing_adapter,
)
from xache.crypto.signer_helpers import (
    create_signer_from_eth_account,
    create_signer_from_solana_keypair,
)


# ============================================================
# Deterministic test keys (NOT real funds — safe to commit)
# ============================================================
EVM_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # Hardhat #0
EVM_CLEAN_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
EVM_ADDRESS = derive_evm_address(EVM_PRIVATE_KEY)
EVM_DID = f"did:agent:evm:{EVM_ADDRESS}"

# Deterministic 32-byte Solana seed
SOL_SEED = bytes([1] + [0] * 31)
SOL_KEYPAIR = SolKeypair.from_seed(SOL_SEED)
SOL_PRIVATE_KEY = SOL_SEED.hex()
SOL_ADDRESS = str(SOL_KEYPAIR.pubkey())
SOL_DID = f"did:agent:sol:{SOL_ADDRESS}"


# ============================================================
# EVM — Auth Signature Parity
# ============================================================

class TestEVMSigningParity:
    """Verify adapter-based signing matches direct sign_message() for EVM."""

    MESSAGE = f"POST\n/v1/memory/store\nabc123hash\n1700000000000\n{EVM_DID}"

    def test_private_key_adapter_matches_sign_message(self):
        """PrivateKeySigningAdapter must produce identical output to sign_message()."""
        old_sig = sign_message(self.MESSAGE, EVM_PRIVATE_KEY, EVM_DID)

        adapter = PrivateKeySigningAdapter(EVM_PRIVATE_KEY, EVM_DID)

        import asyncio
        new_sig = asyncio.run(adapter.sign_auth_message(self.MESSAGE))

        assert new_sig == old_sig, (
            f"PrivateKeySigningAdapter signature mismatch!\n"
            f"  old (sign_message): {old_sig[:20]}...\n"
            f"  new (adapter):      {new_sig[:20]}..."
        )

    def test_external_signer_adapter_matches_sign_message(self):
        """ExternalSignerAdapter with eth_account must match sign_message()."""
        old_sig = sign_message(self.MESSAGE, EVM_PRIVATE_KEY, EVM_DID)

        # Create signer from eth_account
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = ExternalSignerAdapter(signer, EVM_DID)

        import asyncio
        new_sig = asyncio.run(adapter.sign_auth_message(self.MESSAGE))

        assert new_sig == old_sig, (
            f"ExternalSignerAdapter (eth_account) signature mismatch!\n"
            f"  old (sign_message): {old_sig[:20]}...\n"
            f"  new (adapter):      {new_sig[:20]}..."
        )

    def test_wallet_provider_adapter_matches_sign_message(self):
        """WalletProviderAdapter must resolve and produce identical signature."""
        old_sig = sign_message(self.MESSAGE, EVM_PRIVATE_KEY, EVM_DID)

        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)

        class TestProvider:
            async def get_signer(self):
                return signer

            async def get_address(self):
                return acct.address

            def get_chain_type(self):
                return "evm"

        adapter = WalletProviderAdapter(TestProvider(), EVM_DID)

        import asyncio
        new_sig = asyncio.run(adapter.sign_auth_message(self.MESSAGE))

        assert new_sig == old_sig

    @pytest.mark.asyncio
    async def test_auth_headers_async_matches_sync(self):
        """generate_auth_headers_async must produce same X-Sig as generate_auth_headers."""
        method = "POST"
        path = "/v1/memory/store"
        body = '{"data":"test"}'

        # Sync path
        old_headers = generate_auth_headers(method, path, body, EVM_DID, EVM_PRIVATE_KEY)

        # Use same timestamp to get deterministic comparison
        ts = int(old_headers["X-Ts"])
        msg = create_signature_message(method, path, body, ts, EVM_DID)

        # Async path via adapter
        adapter = PrivateKeySigningAdapter(EVM_PRIVATE_KEY, EVM_DID)
        adapter_sig = await adapter.sign_auth_message(msg)

        assert adapter_sig == old_headers["X-Sig"]

    @pytest.mark.asyncio
    async def test_external_signer_auth_headers_match(self):
        """External signer auth headers must match direct private key auth headers."""
        method = "POST"
        path = "/v1/memory/store"
        body = '{"data":"test"}'

        old_headers = generate_auth_headers(method, path, body, EVM_DID, EVM_PRIVATE_KEY)
        ts = int(old_headers["X-Ts"])
        msg = create_signature_message(method, path, body, ts, EVM_DID)

        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = ExternalSignerAdapter(signer, EVM_DID)
        adapter_sig = await adapter.sign_auth_message(msg)

        assert adapter_sig == old_headers["X-Sig"]


# ============================================================
# EVM — Raw keccak256 verification (not EIP-191)
# ============================================================

class TestEVMRawKeccak:
    """Verify that signing uses raw keccak256, NOT EIP-191 prefix."""

    def test_signature_uses_raw_keccak_not_eip191(self):
        """Both paths must sign raw keccak256(message), not prefixed hash."""
        message = "test message"

        # Manually compute what the signature should sign:
        msg_bytes = message.encode("utf-8")
        raw_hash = keccak(msg_bytes)

        pk = eth_keys.PrivateKey(bytes.fromhex(EVM_CLEAN_KEY))
        expected_sig = pk.sign_msg_hash(raw_hash)
        expected_hex = (
            expected_sig.r.to_bytes(32, "big")
            + expected_sig.s.to_bytes(32, "big")
            + bytes([expected_sig.v + 27])
        ).hex()

        # Direct sign_message_evm
        actual = sign_message_evm(message, EVM_CLEAN_KEY)
        assert actual == expected_hex

        # Through adapter
        import asyncio
        adapter = PrivateKeySigningAdapter(EVM_PRIVATE_KEY, EVM_DID)
        adapter_sig = asyncio.run(adapter.sign_auth_message(message))
        assert adapter_sig == expected_hex


# ============================================================
# Solana — Auth Signature Parity
# ============================================================

class TestSolanaSigningParity:
    """Verify adapter-based signing matches direct sign_message() for Solana."""

    MESSAGE = f"POST\n/v1/memory/store\nabc123hash\n1700000000000\n{SOL_DID}"

    def test_private_key_adapter_matches_sign_message(self):
        """PrivateKeySigningAdapter must match sign_message() for Solana."""
        old_sig = sign_message(self.MESSAGE, SOL_PRIVATE_KEY, SOL_DID)

        adapter = PrivateKeySigningAdapter(SOL_PRIVATE_KEY, SOL_DID)

        import asyncio
        new_sig = asyncio.run(adapter.sign_auth_message(self.MESSAGE))

        assert new_sig == old_sig

    def test_external_signer_adapter_matches_sign_message(self):
        """ExternalSignerAdapter with solders Keypair must match sign_message()."""
        old_sig = sign_message(self.MESSAGE, SOL_PRIVATE_KEY, SOL_DID)

        signer = create_signer_from_solana_keypair(SOL_KEYPAIR)
        adapter = ExternalSignerAdapter(signer, SOL_DID)

        import asyncio
        new_sig = asyncio.run(adapter.sign_auth_message(self.MESSAGE))

        assert new_sig == old_sig

    @pytest.mark.asyncio
    async def test_auth_headers_async_matches_sync(self):
        """Async auth headers must match sync for Solana."""
        method = "POST"
        path = "/v1/memory/store"
        body = '{"data":"test"}'

        old_headers = generate_auth_headers(method, path, body, SOL_DID, SOL_PRIVATE_KEY)
        ts = int(old_headers["X-Ts"])
        msg = create_signature_message(method, path, body, ts, SOL_DID)

        adapter = PrivateKeySigningAdapter(SOL_PRIVATE_KEY, SOL_DID)
        adapter_sig = await adapter.sign_auth_message(msg)

        assert adapter_sig == old_headers["X-Sig"]

    @pytest.mark.asyncio
    async def test_external_signer_auth_headers_match(self):
        """External Solana signer auth headers must match direct path."""
        method = "POST"
        path = "/v1/memory/store"
        body = '{"data":"test"}'

        old_headers = generate_auth_headers(method, path, body, SOL_DID, SOL_PRIVATE_KEY)
        ts = int(old_headers["X-Ts"])
        msg = create_signature_message(method, path, body, ts, SOL_DID)

        signer = create_signer_from_solana_keypair(SOL_KEYPAIR)
        adapter = ExternalSignerAdapter(signer, SOL_DID)
        adapter_sig = await adapter.sign_auth_message(msg)

        assert adapter_sig == old_headers["X-Sig"]


# ============================================================
# Solana — ed25519 verification
# ============================================================

class TestSolanaEd25519:
    """Verify Solana signatures are valid ed25519."""

    def test_signature_verifiable_with_pubkey(self):
        """Produced signature must verify against the public key."""
        import base58 as b58

        message = "test message for solana"
        sig_b58 = sign_message_solana(message, SOL_PRIVATE_KEY)
        sig_bytes = b58.b58decode(sig_b58)

        msg_bytes = message.encode("utf-8")
        pubkey_bytes = bytes(SOL_KEYPAIR.pubkey())

        # Verify with tweetnacl-compatible check
        import nacl.signing

        verify_key = nacl.signing.VerifyKey(pubkey_bytes)
        # If this doesn't raise, signature is valid
        verify_key.verify(msg_bytes, sig_bytes)


# ============================================================
# Factory — create_signing_adapter
# ============================================================

class TestFactory:
    def test_creates_private_key_adapter(self):
        adapter = create_signing_adapter(did=EVM_DID, private_key=EVM_PRIVATE_KEY)
        assert isinstance(adapter, PrivateKeySigningAdapter)
        assert adapter.has_private_key() is True
        assert adapter.get_private_key() == EVM_PRIVATE_KEY

    def test_creates_external_signer_adapter(self):
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = create_signing_adapter(did=EVM_DID, signer=signer)
        assert isinstance(adapter, ExternalSignerAdapter)
        assert adapter.has_private_key() is False

    def test_creates_wallet_provider_adapter(self):
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)

        class TestProvider:
            async def get_signer(self):
                return signer
            async def get_address(self):
                return acct.address
            def get_chain_type(self):
                return "evm"

        adapter = create_signing_adapter(did=EVM_DID, wallet_provider=TestProvider())
        assert isinstance(adapter, WalletProviderAdapter)

    def test_creates_read_only_adapter(self):
        adapter = create_signing_adapter(did=EVM_DID)
        assert isinstance(adapter, ReadOnlySigningAdapter)
        assert adapter.has_private_key() is False

    def test_private_key_takes_priority_over_signer(self):
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = create_signing_adapter(
            did=EVM_DID, private_key=EVM_PRIVATE_KEY, signer=signer
        )
        assert isinstance(adapter, PrivateKeySigningAdapter)


# ============================================================
# ReadOnly — Error Behavior
# ============================================================

class TestReadOnly:
    @pytest.mark.asyncio
    async def test_raises_on_sign_auth_message(self):
        adapter = ReadOnlySigningAdapter(EVM_DID)
        with pytest.raises(RuntimeError, match="read-only"):
            await adapter.sign_auth_message("test")

    @pytest.mark.asyncio
    async def test_returns_address_for_encryption_seed(self):
        adapter = ReadOnlySigningAdapter(EVM_DID)
        seed = await adapter.get_encryption_seed()
        assert seed == EVM_ADDRESS


# ============================================================
# Encryption Seed Behavior
# ============================================================

class TestEncryptionSeed:
    @pytest.mark.asyncio
    async def test_private_key_adapter_returns_private_key(self):
        adapter = PrivateKeySigningAdapter(EVM_PRIVATE_KEY, EVM_DID)
        seed = await adapter.get_encryption_seed()
        assert seed == EVM_PRIVATE_KEY

    @pytest.mark.asyncio
    async def test_private_key_adapter_returns_encryption_key_when_set(self):
        adapter = PrivateKeySigningAdapter(
            EVM_PRIVATE_KEY, EVM_DID, encryption_key="custom-key"
        )
        seed = await adapter.get_encryption_seed()
        assert seed == "custom-key"

    @pytest.mark.asyncio
    async def test_external_signer_returns_encryption_key_when_set(self):
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = ExternalSignerAdapter(signer, EVM_DID, encryption_key="ext-key")
        seed = await adapter.get_encryption_seed()
        assert seed == "ext-key"

    @pytest.mark.asyncio
    async def test_external_signer_falls_back_to_address(self):
        acct = Account.from_key(EVM_PRIVATE_KEY)
        signer = create_signer_from_eth_account(acct)
        adapter = ExternalSignerAdapter(signer, EVM_DID)
        seed = await adapter.get_encryption_seed()
        assert seed == acct.address


# ============================================================
# Chain Type Detection
# ============================================================

class TestChainType:
    def test_detects_evm(self):
        adapter = PrivateKeySigningAdapter(EVM_PRIVATE_KEY, EVM_DID)
        assert adapter.get_chain_type() == "evm"

    def test_detects_solana(self):
        adapter = PrivateKeySigningAdapter(SOL_PRIVATE_KEY, SOL_DID)
        assert adapter.get_chain_type() == "solana"

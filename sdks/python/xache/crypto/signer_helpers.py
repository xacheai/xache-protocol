"""
Convenience wrappers for creating XacheSigner from common wallet types.

Example:
    from xache import XacheClient, create_signer_from_eth_account
    from eth_account import Account

    acct = Account.from_key(private_key)
    signer = create_signer_from_eth_account(acct)
    client = XacheClient(api_url=..., did=..., signer=signer)
"""

from __future__ import annotations

from typing import Any


def create_signer_from_eth_account(account: Any) -> Any:
    """
    Create XacheSigner from an eth_account.Account instance.

    Args:
        account: eth_account.Account instance (from Account.from_key())

    Returns:
        XacheSigner-compatible object for use with XacheClient(signer=...)

    Example:
        from eth_account import Account
        acct = Account.from_key("0x...")
        signer = create_signer_from_eth_account(acct)
        client = XacheClient(api_url=..., did=..., signer=signer)
    """

    class EthAccountSigner:
        async def get_address(self) -> str:
            return account.address

        async def sign_message(self, message: bytes) -> bytes:
            from eth_keys import keys as eth_keys  # type: ignore[attr-defined]

            pk = eth_keys.PrivateKey(account.key)
            # Sign the raw hash (message is already keccak256 hash for EVM auth)
            signature = pk.sign_msg_hash(message)
            r = signature.r.to_bytes(32, "big")
            s = signature.s.to_bytes(32, "big")
            v = bytes([signature.v + 27])
            return r + s + v

        async def sign_typed_data(self, domain, types, value) -> str:
            # Use eth_account's built-in EIP-712 signing
            from eth_account.messages import encode_typed_data

            # Build the full typed data structure
            primary_type = next(iter(types.keys()))
            full_message = {
                "domain": domain,
                "types": types,
                "primaryType": primary_type,
                "message": value,
            }
            signed = account.sign_message(encode_typed_data(full_message=full_message))
            return signed.signature.hex()

    return EthAccountSigner()


def create_signer_from_solana_keypair(keypair: Any) -> Any:
    """
    Create XacheSigner from a solders.keypair.Keypair instance.

    Args:
        keypair: solders.keypair.Keypair instance

    Returns:
        XacheSigner-compatible object for use with XacheClient(signer=...)

    Example:
        from solders.keypair import Keypair
        kp = Keypair.from_seed(seed_bytes)
        signer = create_signer_from_solana_keypair(kp)
        client = XacheClient(api_url=..., did=..., signer=signer)
    """

    class SolanaKeypairSigner:
        async def get_address(self) -> str:
            return str(keypair.pubkey())

        async def sign_message(self, message: bytes) -> bytes:
            sig = keypair.sign_message(message)
            return bytes(sig)

        async def sign_typed_data(self, domain, types, value) -> str:
            raise NotImplementedError(
                "EVM signTypedData is not supported on Solana Keypair"
            )

    return SolanaKeypairSigner()

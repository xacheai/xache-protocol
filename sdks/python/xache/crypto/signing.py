"""
Request signing utilities per LLD §2.1
Signature format: METHOD\nPATH\nSHA256(body)\nX-Ts\nX-Agent-DID
"""

import hashlib
import re
import time
from typing import Dict

from eth_account import Account
from eth_account.messages import encode_defunct
from solders.keypair import Keypair  # type: ignore
from solders.pubkey import Pubkey  # type: ignore


def sign_request(
    method: str,
    path: str,
    body: str,
    timestamp: int,
    did: str,
    private_key: str,
) -> str:
    """
    Sign a request per LLD §2.1

    Args:
        method: HTTP method (GET, POST, etc.)
        path: URL path (e.g., /v1/memory/store)
        body: Request body (empty string for GET)
        timestamp: Unix timestamp in milliseconds
        did: Agent DID
        private_key: Private key (hex string without 0x prefix)

    Returns:
        Signature (hex string)
    """
    # Create signature message per LLD §2.1
    message = create_signature_message(method, path, body, timestamp, did)

    # Sign message with private key
    signature = sign_message(message, private_key, did)

    return signature


def create_signature_message(
    method: str,
    path: str,
    body: str,
    timestamp: int,
    did: str,
) -> str:
    """
    Create signature message per LLD §2.1
    Format: METHOD\nPATH\nSHA256(body)\nX-Ts\nX-Agent-DID
    """
    # Calculate SHA256 of body
    body_hash = hashlib.sha256(body.encode('utf-8')).hexdigest()

    # Build message per LLD §2.1
    message = f"{method}\n{path}\n{body_hash}\n{timestamp}\n{did}"

    return message


def sign_message(message: str, private_key: str, did: str) -> str:
    """
    Sign a message with private key
    Supports both EVM (secp256k1) and Solana (ed25519) signing

    Args:
        message: Message to sign
        private_key: Private key (hex string without 0x prefix)
        did: Agent DID (used to determine signing algorithm)

    Returns:
        Signature (hex string without 0x prefix)
    """
    # Remove 0x prefix if present
    clean_key = private_key[2:] if private_key.startswith('0x') else private_key

    # Determine signing method based on DID
    if ':evm:' in did:
        # EVM signing using eth_account (secp256k1)
        return sign_message_evm(message, clean_key)
    elif ':sol:' in did:
        # Solana signing using ed25519
        return sign_message_solana(message, clean_key)
    else:
        raise ValueError(f"Unsupported DID type in: {did}")


def sign_message_evm(message: str, private_key: str) -> str:
    """
    Sign message using EVM secp256k1 (eth_account)
    """
    try:
        # Create account from private key
        account = Account.from_key(f"0x{private_key}")

        # Encode message for Ethereum signing
        message_hash = encode_defunct(text=message)

        # Sign the message
        signed = account.sign_message(message_hash)

        # Return signature as hex without 0x prefix
        return signed.signature.hex()[2:]
    except Exception as e:
        raise ValueError(f"EVM signing failed: {str(e)}")


def sign_message_solana(message: str, private_key: str) -> str:
    """
    Sign message using Solana ed25519
    """
    try:
        # Convert hex private key to bytes
        private_key_bytes = bytes.fromhex(private_key)

        # Create keypair from secret key
        # Solana keypairs are 64 bytes (32-byte secret + 32-byte public)
        if len(private_key_bytes) == 32:
            # If only 32 bytes, treat as seed
            keypair = Keypair.from_seed(private_key_bytes)
        elif len(private_key_bytes) == 64:
            # Full keypair
            keypair = Keypair.from_bytes(private_key_bytes)
        else:
            raise ValueError(f"Invalid Solana private key length: {len(private_key_bytes)} bytes")

        # Sign the message
        message_bytes = message.encode('utf-8')
        signature = keypair.sign_message(message_bytes)

        # Return signature as hex
        return bytes(signature).hex()
    except Exception as e:
        raise ValueError(f"Solana signing failed: {str(e)}")


def validate_did(did: str) -> bool:
    """
    Validate DID format per LLD §2.1
    Format: did:agent:<evm|sol>:<address>
    - EVM: did:agent:evm:0x[40 hex chars]
    - Solana: did:agent:sol:[32-44 base58 chars]
    """
    # Check basic structure
    if not did.startswith('did:agent:'):
        return False

    parts = did.split(':')
    if len(parts) != 4:
        return False

    _, _, chain, address = parts

    if chain == 'evm':
        # EVM addresses: 0x followed by 40 hex characters
        return bool(re.match(r'^0x[a-fA-F0-9]{40}$', address))
    elif chain == 'sol':
        # Solana addresses: base58 string (32-44 characters typical)
        return bool(re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address))

    return False


def validate_timestamp(timestamp: int) -> bool:
    """
    Validate timestamp is within acceptable window (±300s per LLD §2.1)
    """
    now = int(time.time() * 1000)
    diff = abs(now - timestamp)
    return diff <= 300000  # 5 minutes = 300 seconds = 300,000ms


def generate_auth_headers(
    method: str,
    path: str,
    body: str,
    did: str,
    private_key: str,
) -> Dict[str, str]:
    """
    Generate authentication headers per LLD §2.1

    Args:
        method: HTTP method
        path: URL path
        body: Request body (empty string for GET)
        did: Agent DID
        private_key: Private key (hex string)

    Returns:
        Authentication headers
    """
    # Validate DID format
    if not validate_did(did):
        raise ValueError(f"Invalid DID format: {did}")

    # Generate timestamp
    timestamp = int(time.time() * 1000)

    # Validate timestamp
    if not validate_timestamp(timestamp):
        raise ValueError("Generated timestamp is outside acceptable window")

    # Sign request
    signature = sign_request(method, path, body, timestamp, did, private_key)

    # Return headers per LLD §2.1
    return {
        "X-Agent-DID": did,
        "X-Sig": signature,
        "X-Ts": str(timestamp),
    }


def derive_evm_address(private_key: str) -> str:
    """
    Derive Ethereum address from private key
    """
    clean_key = private_key[2:] if private_key.startswith('0x') else private_key
    account = Account.from_key(f"0x{clean_key}")
    return account.address


def derive_solana_address(private_key: str) -> str:
    """
    Derive Solana address from private key
    """
    private_key_bytes = bytes.fromhex(private_key)

    if len(private_key_bytes) == 32:
        keypair = Keypair.from_seed(private_key_bytes)
    elif len(private_key_bytes) == 64:
        keypair = Keypair.from_bytes(private_key_bytes)
    else:
        raise ValueError(f"Invalid Solana private key length: {len(private_key_bytes)} bytes")

    return str(keypair.pubkey())

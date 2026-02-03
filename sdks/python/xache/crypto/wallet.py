"""
Wallet Generation Utilities
Production-ready BIP-39 compliant wallet generation for EVM and Solana
"""

from typing import Optional, Literal
from dataclasses import dataclass
from mnemonic import Mnemonic
from eth_account import Account
from bip_utils import (
    Bip39MnemonicGenerator,
    Bip39SeedGenerator,
    Bip39WordsNum,
    Bip44,
    Bip44Coins,
    Bip44Changes
)
import nacl.signing
import base58

KeyType = Literal['evm', 'solana']


@dataclass
class WalletGenerationResult:
    """Wallet generation result"""
    did: str  # DID format: did:agent:<evm|sol>:<address>
    address: str  # Wallet address
    private_key: str  # Private key (hex string with 0x prefix)
    mnemonic: str  # BIP-39 mnemonic (24 words)
    key_type: KeyType  # Key type (evm or solana)


@dataclass
class WalletGenerationOptions:
    """Wallet generation options"""
    label: Optional[str] = None
    index: int = 0


class WalletGenerator:
    """
    Wallet Generator class
    Provides secure, deterministic wallet generation for AI agents
    """

    @staticmethod
    def generate(
        key_type: KeyType,
        options: Optional[WalletGenerationOptions] = None
    ) -> WalletGenerationResult:
        """
        Generate a new wallet with random mnemonic

        Args:
            key_type: 'evm' for Ethereum/Base or 'solana' for Solana
            options: Optional generation options

        Returns:
            Wallet generation result with DID, keys, and mnemonic

        Example:
            >>> wallet = WalletGenerator.generate('evm')
            >>> print(wallet.did)
            did:agent:evm:0x1234...
        """
        if options is None:
            options = WalletGenerationOptions()

        # Generate 24-word mnemonic (256-bit entropy)
        mnemonic_generator = Bip39MnemonicGenerator()
        mnemonic = mnemonic_generator.FromWordsNumber(Bip39WordsNum.WORDS_NUM_24)

        return WalletGenerator.from_mnemonic(str(mnemonic), key_type, options)

    @staticmethod
    def from_mnemonic(
        mnemonic: str,
        key_type: KeyType,
        options: Optional[WalletGenerationOptions] = None
    ) -> WalletGenerationResult:
        """
        Generate wallet from existing mnemonic

        Args:
            mnemonic: BIP-39 mnemonic phrase (12 or 24 words)
            key_type: 'evm' for Ethereum/Base or 'solana' for Solana
            options: Optional generation options

        Returns:
            Wallet generation result with DID and keys

        Raises:
            ValueError: If mnemonic is invalid
        """
        if options is None:
            options = WalletGenerationOptions()

        # Validate mnemonic
        mnemo = Mnemonic("english")
        if not mnemo.check(mnemonic):
            raise ValueError("Invalid mnemonic phrase")

        if key_type == 'evm':
            return WalletGenerator._generate_evm_wallet(mnemonic, options)
        elif key_type == 'solana':
            return WalletGenerator._generate_solana_wallet(mnemonic, options)
        else:
            raise ValueError(f"Unsupported key type: {key_type}")

    @staticmethod
    def _generate_evm_wallet(
        mnemonic: str,
        options: WalletGenerationOptions
    ) -> WalletGenerationResult:
        """Generate EVM wallet (Ethereum, Base) using BIP-44 path"""
        # BIP-44 path: m/44'/60'/0'/0/{index}
        seed = Bip39SeedGenerator(mnemonic).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.ETHEREUM)

        # Derive account
        bip44_acc = bip44_ctx.Purpose().Coin().Account(0)
        bip44_chg = bip44_acc.Change(Bip44Changes.CHAIN_EXT)
        bip44_addr = bip44_chg.AddressIndex(options.index)

        # Get private key
        private_key_bytes = bip44_addr.PrivateKey().Raw().ToBytes()
        private_key_hex = '0x' + private_key_bytes.hex()

        # Create account from private key
        account = Account.from_key(private_key_bytes)
        address = account.address

        did = f"did:agent:evm:{address}"

        return WalletGenerationResult(
            did=did,
            address=address,
            private_key=private_key_hex,
            mnemonic=mnemonic,
            key_type='evm'
        )

    @staticmethod
    def _generate_solana_wallet(
        mnemonic: str,
        options: WalletGenerationOptions
    ) -> WalletGenerationResult:
        """Generate Solana wallet using BIP-44 path"""
        # BIP-44 path: m/44'/501'/{index}'/0'
        seed = Bip39SeedGenerator(mnemonic).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.SOLANA)

        # Derive account
        bip44_acc = bip44_ctx.Purpose().Coin().Account(options.index)
        bip44_chg = bip44_acc.Change(Bip44Changes.CHAIN_EXT)

        # Get private key (first 32 bytes for ed25519)
        private_key_bytes = bip44_chg.PrivateKey().Raw().ToBytes()[:32]
        private_key_hex = '0x' + private_key_bytes.hex()

        # Create ed25519 key pair
        signing_key = nacl.signing.SigningKey(private_key_bytes)
        verify_key = signing_key.verify_key

        # Encode public key as base58
        address = base58.b58encode(bytes(verify_key)).decode('ascii')

        did = f"did:agent:sol:{address}"

        return WalletGenerationResult(
            did=did,
            address=address,
            private_key=private_key_hex,
            mnemonic=mnemonic,
            key_type='solana'
        )

    @staticmethod
    def validate_did(did: str) -> bool:
        """
        Validate DID format

        Args:
            did: DID string to validate

        Returns:
            True if DID format is valid
        """
        import re

        evm_pattern = r'^did:agent:evm:0x[a-fA-F0-9]{40}$'
        sol_pattern = r'^did:agent:sol:[1-9A-HJ-NP-Za-km-z]{32,44}$'

        return bool(re.match(evm_pattern, did) or re.match(sol_pattern, did))

    @staticmethod
    def did_to_address(did: str) -> str:
        """
        Extract address from DID

        Args:
            did: DID string

        Returns:
            Address extracted from DID

        Raises:
            ValueError: If DID format is invalid
        """
        parts = did.split(':')
        if len(parts) != 4 or parts[0] != 'did' or parts[1] != 'agent':
            raise ValueError('Invalid DID format')
        return parts[3]

    @staticmethod
    def did_to_key_type(did: str) -> KeyType:
        """
        Extract key type from DID

        Args:
            did: DID string

        Returns:
            Key type extracted from DID

        Raises:
            ValueError: If DID format is invalid
        """
        parts = did.split(':')
        if len(parts) != 4 or parts[0] != 'did' or parts[1] != 'agent':
            raise ValueError('Invalid DID format')

        key_type = parts[2]
        if key_type == 'evm':
            return 'evm'
        if key_type == 'sol':
            return 'solana'

        raise ValueError(f'Invalid key type in DID: {key_type}')

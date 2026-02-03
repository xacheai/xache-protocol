/**
 * Wallet Generation Utilities
 * Production-ready BIP-39 compliant wallet generation for EVM and Solana
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import type { KeyType, DID } from '../types';

/**
 * Wallet generation result
 */
export interface WalletGenerationResult {
  /** DID format: did:agent:<evm|sol>:<address> */
  did: DID;
  /** Wallet address */
  address: string;
  /** Private key (hex string with 0x prefix) */
  privateKey: string;
  /** BIP-39 mnemonic (24 words) */
  mnemonic: string;
  /** Key type (evm or solana) */
  keyType: KeyType;
}

/**
 * Wallet generation options
 */
export interface WalletGenerationOptions {
  /** Optional label for tracking */
  label?: string;
  /** Derivation path index (default: 0) */
  index?: number;
}

/**
 * Wallet Generator class
 * Provides secure, deterministic wallet generation for AI agents
 */
export class WalletGenerator {
  /**
   * Generate a new wallet with random mnemonic
   *
   * @param keyType - 'evm' for Ethereum/Base or 'solana' for Solana
   * @param options - Optional generation options
   * @returns Wallet generation result with DID, keys, and mnemonic
   */
  static generate(
    keyType: KeyType,
    options: WalletGenerationOptions = {}
  ): WalletGenerationResult {
    const mnemonic = generateMnemonic(256);
    return this.fromMnemonic(mnemonic, keyType, options);
  }

  /**
   * Generate wallet from existing mnemonic
   *
   * @param mnemonic - BIP-39 mnemonic phrase (12 or 24 words)
   * @param keyType - 'evm' for Ethereum/Base or 'solana' for Solana
   * @param options - Optional generation options
   * @returns Wallet generation result with DID and keys
   */
  static fromMnemonic(
    mnemonic: string,
    keyType: KeyType,
    options: WalletGenerationOptions = {}
  ): WalletGenerationResult {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    if (keyType === 'evm') {
      return this.generateEVMWallet(mnemonic, options);
    } else if (keyType === 'solana') {
      return this.generateSolanaWallet(mnemonic, options);
    } else {
      throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Generate EVM wallet (Ethereum, Base) using BIP-44 path
   */
  private static generateEVMWallet(
    mnemonic: string,
    options: WalletGenerationOptions
  ): WalletGenerationResult {
    const seed = mnemonicToSeedSync(mnemonic);
    const index = options.index ?? 0;

    const path = `m/44'/60'/0'/0/${index}`;
    const hdKey = HDKey.fromMasterSeed(seed).derive(path);

    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key');
    }

    const privateKeyHex = '0x' + bytesToHex(hdKey.privateKey);

    const address = this.privateKeyToEVMAddress(hdKey.privateKey);
    const did = `did:agent:evm:${address}` as DID;

    return {
      did,
      address,
      privateKey: privateKeyHex,
      mnemonic,
      keyType: 'evm',
    };
  }

  /**
   * Generate Solana wallet using BIP-44 path
   */
  private static generateSolanaWallet(
    mnemonic: string,
    options: WalletGenerationOptions
  ): WalletGenerationResult {
    const seed = mnemonicToSeedSync(mnemonic);
    const index = options.index ?? 0;

    const path = `m/44'/501'/${index}'/0'`;
    const hdKey = HDKey.fromMasterSeed(seed).derive(path);

    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key');
    }

    const privateKeyHex = '0x' + bytesToHex(hdKey.privateKey);

    const address = this.privateKeyToSolanaAddress(hdKey.privateKey);
    const did = `did:agent:sol:${address}` as DID;

    return {
      did,
      address,
      privateKey: privateKeyHex,
      mnemonic,
      keyType: 'solana',
    };
  }

  /**
   * Convert private key to EVM address
   */
  private static privateKeyToEVMAddress(privateKey: Uint8Array): string {
    const { keccak_256 } = require('@noble/hashes/sha3');
    const { secp256k1 } = require('@noble/curves/secp256k1');

    const publicKey = secp256k1.getPublicKey(privateKey, false);

    const publicKeyHash = keccak_256(publicKey.slice(1));

    const address = '0x' + bytesToHex(publicKeyHash.slice(-20));

    return address;
  }

  /**
   * Convert private key to Solana address (base58)
   */
  private static privateKeyToSolanaAddress(privateKey: Uint8Array): string {
    const { ed25519 } = require('@noble/curves/ed25519');
    const bs58 = require('bs58');

    const publicKey = ed25519.getPublicKey(privateKey);

    const address = bs58.encode(publicKey);

    return address;
  }

  /**
   * Validate DID format
   */
  static validateDID(did: string): boolean {
    const evmPattern = /^did:agent:evm:0x[a-fA-F0-9]{40}$/;
    const solPattern = /^did:agent:sol:[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    return evmPattern.test(did) || solPattern.test(did);
  }

  /**
   * Extract address from DID
   */
  static didToAddress(did: DID): string {
    const parts = did.split(':');
    if (parts.length !== 4 || parts[0] !== 'did' || parts[1] !== 'agent') {
      throw new Error('Invalid DID format');
    }
    return parts[3];
  }

  /**
   * Extract key type from DID
   */
  static didToKeyType(did: DID): KeyType {
    const parts = did.split(':');
    if (parts.length !== 4 || parts[0] !== 'did' || parts[1] !== 'agent') {
      throw new Error('Invalid DID format');
    }

    const keyType = parts[2];
    if (keyType === 'evm') return 'evm';
    if (keyType === 'sol') return 'solana';

    throw new Error(`Invalid key type in DID: ${keyType}`);
  }
}

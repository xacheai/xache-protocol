/**
 * Request signing utilities per LLD §2.1
 * Signature format: METHOD\nPATH\nSHA256(body)\nX-Ts\nX-Agent-DID
 *
 * SECURITY: Path MUST include query string (e.g., /v1/memory?limit=10)
 * to prevent request parameter tampering attacks.
 */

import { createHash } from 'crypto';
import { Wallet, hashMessage, keccak256, toUtf8Bytes } from 'ethers';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import type { DID } from '../types';

/**
 * Sign a request per LLD §2.1
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - URL path WITH query string (e.g., /v1/memory?limit=10)
 *               SECURITY: Must include query params to prevent tampering
 * @param body - Request body (empty string for GET)
 * @param timestamp - Unix timestamp in milliseconds
 * @param did - Agent DID
 * @param privateKey - Private key (hex string without 0x prefix)
 * @returns Signature (hex string)
 */
export function signRequest(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  did: DID,
  privateKey: string
): string {
  // Create signature message per LLD §2.1
  const message = createSignatureMessage(method, path, body, timestamp, did);

  // Sign message with private key
  const signature = signMessage(message, privateKey, did);

  return signature;
}

/**
 * Create signature message per LLD §2.1
 * Format: METHOD\nPATH\nSHA256(body)\nX-Ts\nX-Agent-DID
 */
export function createSignatureMessage(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  did: DID
): string {
  // Calculate SHA256 of body
  const bodyHash = createHash('sha256')
    .update(body)
    .digest('hex');

  // Build message per LLD §2.1
  const message = `${method}\n${path}\n${bodyHash}\n${timestamp}\n${did}`;

  return message;
}

/**
 * Sign a message with private key
 * Supports both EVM (secp256k1) and Solana (ed25519) signing
 *
 * @param message - Message to sign
 * @param privateKey - Private key (hex string without 0x prefix)
 * @param did - Agent DID (used to determine signing algorithm)
 * @returns Signature (hex string without 0x prefix)
 */
export function signMessage(message: string, privateKey: string, did: DID): string {
  // Remove 0x prefix if present
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  // Determine signing method based on DID
  if (did.includes(':evm:')) {
    // EVM signing using ethers.js (secp256k1)
    return signMessageEVM(message, cleanKey);
  } else if (did.includes(':sol:')) {
    // Solana signing using ed25519
    return signMessageSolana(message, cleanKey);
  } else {
    throw new Error(`Unsupported DID type in: ${did}`);
  }
}

/**
 * Sign message using EVM secp256k1 (raw keccak256, not ethers' hashMessage)
 * IMPORTANT: Uses raw keccak256 to match server-side verification
 */
function signMessageEVM(message: string, privateKey: string): string {
  try {
    // Create wallet from private key
    const wallet = new Wallet(`0x${privateKey}`);

    // Convert message to bytes
    const messageBytes = toUtf8Bytes(message);

    // Use raw keccak256 (NOT ethers' hashMessage which adds Ethereum prefix)
    const messageHash = keccak256(messageBytes);

    // Sign the raw hash
    const signature = wallet.signingKey.sign(messageHash).serialized;

    // Remove 0x prefix
    return signature.slice(2);
  } catch (error) {
    throw new Error(`EVM signing failed: ${(error as Error).message}`);
  }
}

/**
 * Sign message using Solana ed25519
 */
function signMessageSolana(message: string, privateKey: string): string {
  try {
    // Convert hex private key to Uint8Array
    const privateKeyBytes = Buffer.from(privateKey, 'hex');

    // Solana uses 64-byte keypairs (32-byte secret + 32-byte public)
    // If we only have 32 bytes, derive the full keypair
    let keypair: Keypair;
    if (privateKeyBytes.length === 32) {
      keypair = Keypair.fromSeed(privateKeyBytes);
    } else if (privateKeyBytes.length === 64) {
      keypair = Keypair.fromSecretKey(privateKeyBytes);
    } else {
      throw new Error(`Invalid Solana private key length: ${privateKeyBytes.length} bytes`);
    }

    // Sign the message using ed25519
    const messageBytes = Buffer.from(message, 'utf-8');
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

    // Return signature as base58 (NOT hex) to match server-side verification
    return base58Encode(signature);
  } catch (error) {
    throw new Error(`Solana signing failed: ${(error as Error).message}`);
  }
}

/**
 * Base58 encode bytes (Solana standard)
 */
export function base58Encode(bytes: Uint8Array): string {
  const digits = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let encoded = '';

  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = digits[remainder] + encoded;
    num = num / 58n;
  }

  // Add leading '1' for each leading zero byte
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = '1' + encoded;
  }

  return encoded || '1';
}

/**
 * Validate DID format per LLD §2.1
 * Format: did:<agent|owner>:<evm|sol>:<address>
 * - EVM Agent: did:agent:evm:0x[40 hex chars]
 * - EVM Owner: did:owner:evm:0x[40 hex chars]
 * - Solana Agent: did:agent:sol:[32-44 base58 chars]
 * - Solana Owner: did:owner:sol:[32-44 base58 chars]
 */
export function validateDID(did: string): boolean {
  // Check basic structure - support both agent and owner DIDs
  if (!did.startsWith('did:agent:') && !did.startsWith('did:owner:')) {
    return false;
  }

  const parts = did.split(':');
  if (parts.length !== 4) {
    return false;
  }

  const [, entityType, chain, address] = parts;

  // Validate entity type
  if (entityType !== 'agent' && entityType !== 'owner') {
    return false;
  }

  if (chain === 'evm') {
    // EVM addresses: 0x followed by 40 hex characters
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  } else if (chain === 'sol') {
    // Solana addresses: base58 string (32-44 characters typical)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  return false;
}

/**
 * Validate timestamp is within acceptable window (±300s per LLD §2.1)
 */
export function validateTimestamp(timestamp: number): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= 300000; // 5 minutes = 300 seconds = 300,000ms
}

/**
 * Generate authentication headers per LLD §2.1
 *
 * @param method - HTTP method
 * @param path - URL path WITH query string (e.g., /v1/memory?limit=10)
 *               SECURITY: Must include query params to prevent tampering
 * @param body - Request body (empty string for GET)
 * @param did - Agent DID
 * @param privateKey - Private key (hex string)
 * @returns Authentication headers
 */
export function generateAuthHeaders(
  method: string,
  path: string,
  body: string,
  did: DID,
  privateKey: string
): Record<string, string> {
  // Validate DID format
  if (!validateDID(did)) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  // Generate timestamp
  const timestamp = Date.now();

  // Validate timestamp
  if (!validateTimestamp(timestamp)) {
    throw new Error('Generated timestamp is outside acceptable window');
  }

  // Sign request
  const signature = signRequest(method, path, body, timestamp, did, privateKey);

  // Return headers per LLD §2.1
  return {
    'X-Agent-DID': did,
    'X-Sig': signature,
    'X-Ts': timestamp.toString(),
  };
}

/**
 * Derive Ethereum address from private key
 */
export function deriveEVMAddress(privateKey: string): string {
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const wallet = new Wallet(`0x${cleanKey}`);
  return wallet.address;
}

/**
 * Derive Solana address from private key
 */
export function deriveSolanaAddress(privateKey: string): string {
  const privateKeyBytes = Buffer.from(privateKey, 'hex');
  let keypair: Keypair;

  if (privateKeyBytes.length === 32) {
    keypair = Keypair.fromSeed(privateKeyBytes);
  } else if (privateKeyBytes.length === 64) {
    keypair = Keypair.fromSecretKey(privateKeyBytes);
  } else {
    throw new Error(`Invalid Solana private key length: ${privateKeyBytes.length} bytes`);
  }

  return keypair.publicKey.toBase58();
}

/**
 * Generate authentication headers using a signing adapter (async variant).
 * Routes signing through the adapter instead of requiring a raw private key.
 *
 * @param method - HTTP method
 * @param path - URL path WITH query string
 * @param body - Request body (empty string for GET)
 * @param did - Agent DID
 * @param adapter - Signing adapter (ISigningAdapter)
 * @returns Authentication headers
 */
export async function generateAuthHeadersAsync(
  method: string,
  path: string,
  body: string,
  did: DID,
  adapter: import('./SigningAdapter').ISigningAdapter
): Promise<Record<string, string>> {
  if (!validateDID(did)) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const timestamp = Date.now();

  if (!validateTimestamp(timestamp)) {
    throw new Error('Generated timestamp is outside acceptable window');
  }

  const message = createSignatureMessage(method, path, body, timestamp, did);
  const signature = await adapter.signAuthMessage(message);

  return {
    'X-Agent-DID': did,
    'X-Sig': signature,
    'X-Ts': timestamp.toString(),
  };
}

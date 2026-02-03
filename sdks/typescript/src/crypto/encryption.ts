/**
 * Encryption utilities for client-side data encryption
 * Uses libsodium (NaCl) for production-grade encryption
 */

import sodium from 'libsodium-wrappers';

/**
 * Encryption key pair
 */
export interface EncryptionKeyPair {
  publicKey: string;  // base64
  secretKey: string;  // base64
}

/**
 * Encrypted data
 */
export interface EncryptedData {
  ciphertext: string;  // base64
  nonce: string;       // base64
}

/**
 * Ensure libsodium is ready
 */
async function ensureSodiumReady(): Promise<void> {
  await sodium.ready;
}

/**
 * Encrypt data using secretbox (symmetric encryption)
 * Uses XSalsa20-Poly1305 authenticated encryption
 *
 * @param data - Data to encrypt (will be JSON stringified)
 * @param key - Encryption key (32 bytes, base64)
 * @returns Encrypted data with nonce
 */
export async function encryptData(data: Record<string, unknown>, key: string): Promise<EncryptedData> {
  await ensureSodiumReady();

  // Convert data to JSON string then to bytes
  const jsonStr = JSON.stringify(data);
  const dataBytes = new TextEncoder().encode(jsonStr);

  // Decode key from base64
  const keyBytes = sodium.from_base64(key);

  if (keyBytes.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(`Invalid key length: expected ${sodium.crypto_secretbox_KEYBYTES} bytes`);
  }

  // Generate random nonce
  const nonceBytes = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // Encrypt using secretbox (XSalsa20-Poly1305)
  const ciphertextBytes = sodium.crypto_secretbox_easy(dataBytes, nonceBytes, keyBytes);

  return {
    ciphertext: sodium.to_base64(ciphertextBytes),
    nonce: sodium.to_base64(nonceBytes),
  };
}

/**
 * Decrypt data using secretbox
 *
 * @param encrypted - Encrypted data with nonce
 * @param key - Encryption key (32 bytes, base64)
 * @returns Decrypted data
 */
export async function decryptData(encrypted: EncryptedData, key: string): Promise<Record<string, unknown>> {
  await ensureSodiumReady();

  // Decode from base64
  const keyBytes = sodium.from_base64(key);
  const nonceBytes = sodium.from_base64(encrypted.nonce);
  const ciphertextBytes = sodium.from_base64(encrypted.ciphertext);

  if (keyBytes.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(`Invalid key length: expected ${sodium.crypto_secretbox_KEYBYTES} bytes`);
  }

  if (nonceBytes.length !== sodium.crypto_secretbox_NONCEBYTES) {
    throw new Error(`Invalid nonce length: expected ${sodium.crypto_secretbox_NONCEBYTES} bytes`);
  }

  // Decrypt using secretbox
  const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertextBytes, nonceBytes, keyBytes);

  if (!decryptedBytes) {
    throw new Error('Decryption failed: invalid ciphertext or key');
  }

  // Convert bytes to JSON
  const jsonStr = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(jsonStr);
}

/**
 * Generate encryption key pair for public-key encryption
 * Uses Curve25519-XSalsa20-Poly1305
 *
 * @returns Key pair (public and secret keys)
 */
export async function generateKeyPair(): Promise<EncryptionKeyPair> {
  await ensureSodiumReady();

  const keyPair = sodium.crypto_box_keypair();

  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    secretKey: sodium.to_base64(keyPair.privateKey),
  };
}

/**
 * Generate symmetric encryption key
 *
 * @returns Random 32-byte key (base64)
 */
export async function generateKey(): Promise<string> {
  await ensureSodiumReady();

  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return sodium.to_base64(key);
}

/**
 * Derive encryption key from password using Argon2
 * Uses Argon2id with interactive parameters
 *
 * @param password - Password
 * @param salt - Salt (16 bytes, base64)
 * @returns Encryption key (32 bytes, base64)
 */
export async function deriveKeyFromPassword(password: string, salt: string): Promise<string> {
  await ensureSodiumReady();

  const saltBytes = sodium.from_base64(salt);

  if (saltBytes.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(`Invalid salt length: expected ${sodium.crypto_pwhash_SALTBYTES} bytes`);
  }

  // Use Argon2id with interactive parameters (suitable for client-side)
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    saltBytes,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return sodium.to_base64(key);
}

/**
 * Generate random nonce (24 bytes for secretbox)
 */
export async function generateNonce(): Promise<string> {
  await ensureSodiumReady();

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  return sodium.to_base64(nonce);
}

/**
 * Generate random salt (16 bytes for Argon2)
 */
export async function generateSalt(): Promise<string> {
  await ensureSodiumReady();

  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  return sodium.to_base64(salt);
}

/**
 * Securely wipe sensitive data from memory
 *
 * @param data - Base64 encoded sensitive data
 */
export async function secureClear(data: string): Promise<void> {
  await ensureSodiumReady();

  try {
    const bytes = sodium.from_base64(data);
    sodium.memzero(bytes);
  } catch (error) {
    // Ignore errors for invalid base64
  }
}

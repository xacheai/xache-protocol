/**
 * Signing Adapter Abstraction
 *
 * Normalizes three signing modes into a unified interface:
 * 1. PrivateKeySigningAdapter — wraps raw privateKey (existing behavior)
 * 2. ExternalSignerAdapter — wraps XacheSigner (e.g., AgentKit, ethers.Wallet)
 * 3. WalletProviderAdapter — wraps XacheWalletProvider (lazy getSigner)
 * 4. ReadOnlySigningAdapter — for clients without signing capability
 */

import type { DID, XacheSigner, XacheWalletProvider } from '../types';

/**
 * Unified signing adapter interface.
 * All SDK signing operations (auth headers, payments, encryption) flow through this.
 */
export interface ISigningAdapter {
  /** Get the wallet address */
  getAddress(): Promise<string>;

  /** Get the chain type derived from DID */
  getChainType(): 'evm' | 'solana';

  /**
   * Sign a raw auth message string.
   * For EVM: keccak256 hash + secp256k1 sign → hex string
   * For Solana: ed25519 sign → base58 string
   */
  signAuthMessage(message: string): Promise<string>;

  /**
   * Sign EIP-712 typed data (for EVM ERC-3009 payments and ERC-8004).
   * Returns hex-encoded signature.
   * Throws if chain is not EVM.
   */
  signTypedData(
    domain: { name: string; version: string; chainId: number; verifyingContract: string },
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string>;

  /**
   * Sign a Solana VersionedTransaction by adding the agent's signature.
   * Throws if chain is not Solana.
   */
  signSolanaTransaction(transaction: any): Promise<void>;

  /**
   * Get the raw private key if available (for backward compat paths).
   * Returns undefined when using external signer.
   */
  getPrivateKey(): string | undefined;

  /**
   * Get material for encryption key derivation.
   * - PrivateKey mode: returns privateKey string
   * - External signer with encryptionKey: returns encryptionKey
   * - External signer fallback: returns wallet address
   */
  getEncryptionSeed(): Promise<string>;

  /** Whether this adapter has a raw private key */
  hasPrivateKey(): boolean;
}

// ============================================================
// PrivateKeySigningAdapter — wraps raw privateKey (existing behavior)
// ============================================================

export class PrivateKeySigningAdapter implements ISigningAdapter {
  private readonly cleanKey: string;

  constructor(
    private readonly privateKey: string,
    private readonly did: DID,
    private readonly encryptionKey?: string
  ) {
    this.cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  }

  async getAddress(): Promise<string> {
    return this.did.split(':')[3];
  }

  getChainType(): 'evm' | 'solana' {
    return this.did.includes(':evm:') ? 'evm' : 'solana';
  }

  async signAuthMessage(message: string): Promise<string> {
    // Delegate to existing signMessage() — preserves exact existing behavior
    const { signMessage } = await import('./signing');
    return signMessage(message, this.privateKey, this.did);
  }

  async signTypedData(
    domain: { name: string; version: string; chainId: number; verifyingContract: string },
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    const { ethers } = await import('ethers');
    const wallet = new ethers.Wallet(`0x${this.cleanKey}`);
    return wallet.signTypedData(domain, types, value);
  }

  async signSolanaTransaction(transaction: any): Promise<void> {
    const { Keypair } = await import('@solana/web3.js');
    const keyBytes = Buffer.from(this.cleanKey, 'hex');
    const keypair = keyBytes.length === 32
      ? Keypair.fromSeed(keyBytes)
      : Keypair.fromSecretKey(keyBytes);
    transaction.sign([keypair]);
  }

  getPrivateKey(): string | undefined {
    return this.privateKey;
  }

  async getEncryptionSeed(): Promise<string> {
    return this.encryptionKey ?? this.privateKey;
  }

  hasPrivateKey(): boolean {
    return true;
  }
}

// ============================================================
// ExternalSignerAdapter — wraps XacheSigner
// ============================================================

export class ExternalSignerAdapter implements ISigningAdapter {
  private cachedAddress?: string;

  constructor(
    private readonly signer: XacheSigner,
    private readonly did: DID,
    private readonly encryptionKey?: string
  ) {}

  async getAddress(): Promise<string> {
    if (!this.cachedAddress) {
      this.cachedAddress = await this.signer.getAddress();
    }
    return this.cachedAddress;
  }

  getChainType(): 'evm' | 'solana' {
    return this.did.includes(':evm:') ? 'evm' : 'solana';
  }

  async signAuthMessage(message: string): Promise<string> {
    if (this.getChainType() === 'evm') {
      // EVM auth: raw keccak256 + sign (NOT EIP-191)
      const { keccak256, toUtf8Bytes } = await import('ethers');
      const messageBytes = toUtf8Bytes(message);
      const messageHash = keccak256(messageBytes);
      // Pass raw hash bytes to signer
      const hashBytes = new Uint8Array(Buffer.from(messageHash.slice(2), 'hex'));
      const sigBytes = await this.signer.signMessage(hashBytes);
      return Buffer.from(sigBytes).toString('hex');
    } else {
      // Solana auth: ed25519 sign → base58
      const messageBytes = new TextEncoder().encode(message);
      const sigBytes = await this.signer.signMessage(messageBytes);
      const { base58Encode } = await import('./signing');
      return base58Encode(sigBytes);
    }
  }

  async signTypedData(
    domain: { name: string; version: string; chainId: number; verifyingContract: string },
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    if (this.getChainType() !== 'evm') {
      throw new Error('signTypedData is only supported for EVM chains');
    }
    return this.signer.signTypedData(domain, types, value);
  }

  async signSolanaTransaction(transaction: any): Promise<void> {
    if (this.getChainType() !== 'solana') {
      throw new Error('signSolanaTransaction is only supported for Solana chains');
    }
    // Sign the serialized transaction message, then attach the signature
    const messageBytes: Uint8Array = transaction.message.serialize();
    const sigBytes = await this.signer.signMessage(messageBytes);

    // Get signer's public key for the signature slot
    const { PublicKey } = await import('@solana/web3.js');
    const address = await this.getAddress();
    const pubkey = new PublicKey(address);

    // Inject signature into the VersionedTransaction
    // Find the index of this signer in the message's account keys
    const accountKeys = transaction.message.staticAccountKeys;
    const signerIndex = accountKeys.findIndex(
      (key: any) => key.equals(pubkey)
    );
    if (signerIndex === -1) {
      throw new Error(`Signer ${address} not found in transaction account keys`);
    }
    transaction.signatures[signerIndex] = sigBytes;
  }

  getPrivateKey(): string | undefined {
    return undefined;
  }

  async getEncryptionSeed(): Promise<string> {
    if (this.encryptionKey) return this.encryptionKey;
    // Fallback: use wallet address as seed (with warning logged by MemoryService)
    return await this.getAddress();
  }

  hasPrivateKey(): boolean {
    return false;
  }
}

// ============================================================
// WalletProviderAdapter — wraps XacheWalletProvider (lazy resolution)
// ============================================================

export class WalletProviderAdapter implements ISigningAdapter {
  private resolvedAdapter?: ExternalSignerAdapter;

  constructor(
    private readonly provider: XacheWalletProvider,
    private readonly did: DID,
    private readonly encryptionKey?: string
  ) {}

  private async resolve(): Promise<ExternalSignerAdapter> {
    if (!this.resolvedAdapter) {
      const signer = await this.provider.getSigner();
      this.resolvedAdapter = new ExternalSignerAdapter(signer, this.did, this.encryptionKey);
    }
    return this.resolvedAdapter;
  }

  async getAddress(): Promise<string> {
    return (await this.resolve()).getAddress();
  }

  getChainType(): 'evm' | 'solana' {
    return this.did.includes(':evm:') ? 'evm' : 'solana';
  }

  async signAuthMessage(message: string): Promise<string> {
    return (await this.resolve()).signAuthMessage(message);
  }

  async signTypedData(
    domain: { name: string; version: string; chainId: number; verifyingContract: string },
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    return (await this.resolve()).signTypedData(domain, types, value);
  }

  async signSolanaTransaction(transaction: any): Promise<void> {
    return (await this.resolve()).signSolanaTransaction(transaction);
  }

  getPrivateKey(): string | undefined {
    return undefined;
  }

  async getEncryptionSeed(): Promise<string> {
    return (await this.resolve()).getEncryptionSeed();
  }

  hasPrivateKey(): boolean {
    return false;
  }
}

// ============================================================
// ReadOnlySigningAdapter — for clients without any signing config
// ============================================================

export class ReadOnlySigningAdapter implements ISigningAdapter {
  constructor(private readonly did: DID) {}

  async getAddress(): Promise<string> {
    return this.did.split(':')[3];
  }

  getChainType(): 'evm' | 'solana' {
    return this.did.includes(':evm:') ? 'evm' : 'solana';
  }

  async signAuthMessage(): Promise<string> {
    throw new Error(
      'Cannot sign: client is read-only. ' +
      'Provide privateKey, signer, or walletProvider to make authenticated requests.'
    );
  }

  async signTypedData(): Promise<string> {
    throw new Error('Cannot sign: client is read-only.');
  }

  async signSolanaTransaction(): Promise<void> {
    throw new Error('Cannot sign: client is read-only.');
  }

  getPrivateKey(): string | undefined {
    return undefined;
  }

  async getEncryptionSeed(): Promise<string> {
    // Fallback: use DID address as seed
    return this.did.split(':')[3];
  }

  hasPrivateKey(): boolean {
    return false;
  }
}

// ============================================================
// Factory function
// ============================================================

/**
 * Create a signing adapter from client configuration.
 * Priority: privateKey > signer > walletProvider > ReadOnly
 */
export function createSigningAdapter(config: {
  privateKey?: string;
  signer?: XacheSigner;
  walletProvider?: XacheWalletProvider;
  did: DID;
  encryptionKey?: string;
}): ISigningAdapter {
  if (config.privateKey) {
    return new PrivateKeySigningAdapter(config.privateKey, config.did, config.encryptionKey);
  }
  if (config.signer) {
    return new ExternalSignerAdapter(config.signer, config.did, config.encryptionKey);
  }
  if (config.walletProvider) {
    return new WalletProviderAdapter(config.walletProvider, config.did, config.encryptionKey);
  }
  return new ReadOnlySigningAdapter(config.did);
}

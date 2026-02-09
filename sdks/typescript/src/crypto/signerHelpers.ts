/**
 * Convenience wrappers to create XacheSigner from common wallet types.
 *
 * These helpers make it easy to use external wallets (ethers.js, Solana Keypair,
 * Coinbase AgentKit) as XacheSigner instances without manual interface mapping.
 *
 * @example
 * ```typescript
 * import { createSignerFromEthersWallet, XacheClient } from '@xache/sdk';
 * import { ethers } from 'ethers';
 *
 * const wallet = new ethers.Wallet(privateKey);
 * const signer = createSignerFromEthersWallet(wallet);
 * const client = new XacheClient({ apiUrl, did, signer });
 * ```
 */

import type { XacheSigner } from '../types';

/**
 * Create XacheSigner from an ethers.js v6 Wallet.
 *
 * @param wallet - ethers.js Wallet instance (must have address, signTypedData, signingKey)
 */
export function createSignerFromEthersWallet(wallet: {
  address: string;
  signTypedData: (
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ) => Promise<string>;
  signingKey: {
    sign: (digest: string) => { serialized: string };
  };
}): XacheSigner {
  return {
    getAddress: async () => wallet.address,
    signTypedData: (domain, types, value) =>
      wallet.signTypedData(domain as Record<string, unknown>, types, value),
    signMessage: async (message: Uint8Array) => {
      // For auth headers: message is a raw keccak256 hash (32 bytes for EVM)
      // or raw message bytes (for Solana, though this wrapper is EVM-specific)
      // Use signingKey.sign for raw hash signing (no EIP-191 prefix)
      const hashHex = '0x' + Buffer.from(message).toString('hex');
      const sig = wallet.signingKey.sign(hashHex);
      const sigHex = sig.serialized.startsWith('0x') ? sig.serialized.slice(2) : sig.serialized;
      return new Uint8Array(Buffer.from(sigHex, 'hex'));
    },
  };
}

/**
 * Create XacheSigner from a Solana Keypair.
 *
 * @param keypair - Solana Keypair instance (from @solana/web3.js)
 */
export function createSignerFromSolanaKeypair(keypair: {
  publicKey: { toBase58(): string };
  secretKey: Uint8Array;
}): XacheSigner {
  return {
    getAddress: async () => keypair.publicKey.toBase58(),
    signTypedData: async () => {
      throw new Error('EVM signTypedData is not supported on Solana Keypair');
    },
    signMessage: async (message: Uint8Array) => {
      // Use tweetnacl for ed25519 detached signing
      const nacl = await import('tweetnacl');
      return nacl.default.sign.detached(message, keypair.secretKey);
    },
  };
}

/**
 * Create XacheSigner from a Coinbase AgentKit instance.
 *
 * @param agentKit - AgentKit instance with getWallet() method
 */
export function createSignerFromAgentKit(agentKit: {
  getWallet(): Promise<{
    address: string;
    signTypedData(
      domain: Record<string, unknown>,
      types: Record<string, Array<{ name: string; type: string }>>,
      value: Record<string, unknown>
    ): Promise<string>;
    signMessage(message: string | Uint8Array): Promise<string>;
  }>;
}): XacheSigner {
  let wallet: Awaited<ReturnType<typeof agentKit.getWallet>> | undefined;

  const getWallet = async () => {
    if (!wallet) wallet = await agentKit.getWallet();
    return wallet;
  };

  return {
    getAddress: async () => (await getWallet()).address,
    signTypedData: async (domain, types, value) =>
      (await getWallet()).signTypedData(domain as Record<string, unknown>, types, value),
    signMessage: async (message: Uint8Array) => {
      const w = await getWallet();
      const sig = await w.signMessage(message);
      const sigHex = sig.startsWith('0x') ? sig.slice(2) : sig;
      return new Uint8Array(Buffer.from(sigHex, 'hex'));
    },
  };
}

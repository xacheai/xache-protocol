/**
 * Payment Authorization Signer
 * Creates off-chain payment authorizations for x402 protocol
 * Supports both EVM (ERC-3009) and Solana networks
 */

import { ethers } from 'ethers';
import type { NetworkId } from '@xache/types';
import { createLogger } from '@xache/utils';

const logger = createLogger({ service: 'payment-signer' });

/**
 * ERC-3009 authorization object (EVM networks)
 */
export interface ERC3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string; // Unix timestamp as string per x402 spec
  validBefore: string; // Unix timestamp as string per x402 spec
  nonce: string;
}

/**
 * EVM payment authorization result
 */
export interface EVMPaymentAuthorization {
  authorization: ERC3009Authorization;
  signature: string;
}

/**
 * Solana payment authorization result
 */
export interface SolanaPaymentAuthorization {
  transaction: string; // Partially signed transaction
  signers: string[]; // Public keys that have signed
}

/**
 * Generic payment authorization result
 */
export type PaymentAuthorization = EVMPaymentAuthorization | SolanaPaymentAuthorization;

/**
 * EIP-712 domain for USDC ERC-3009
 */
function getEIP712Domain(usdcAddress: string, chainId: number) {
  return {
    name: 'USD Coin',
    version: '2',
    chainId,
    verifyingContract: usdcAddress,
  };
}

/**
 * EIP-712 types for transferWithAuthorization
 * See: https://eips.ethereum.org/EIPS/eip-3009
 */
const ERC3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Get chain ID for network
 */
function getChainId(network: NetworkId): number {
  switch (network) {
    case 'base-sepolia':
      return 84532;
    case 'base-mainnet':
      return 8453;
    case 'ethereum-mainnet':
      return 1;
    case 'ethereum-sepolia':
      return 11155111;
    default:
      throw new Error(`Unknown EVM network: ${network}`);
  }
}

/**
 * Check if network is EVM-based
 */
export function isEVMNetwork(network: NetworkId): boolean {
  return network.startsWith('base-') || network.startsWith('ethereum-');
}

/**
 * Check if network is Solana-based
 */
export function isSolanaNetwork(network: NetworkId): boolean {
  return network.startsWith('solana-');
}

/**
 * Create ERC-3009 authorization for EVM networks
 *
 * @param params - Authorization parameters
 * @returns EVM payment authorization with signature
 */
export async function createERC3009Authorization(params: {
  agentPrivateKey: string;
  agentAddress: string;
  recipientAddress: string;
  amount: string; // Atomic units (e.g., 1000 = 0.001 USDC)
  usdcAddress: string;
  network: NetworkId;
}): Promise<EVMPaymentAuthorization> {
  logger.debug('Creating ERC-3009 authorization', {
    network: params.network,
    from: params.agentAddress,
    to: params.recipientAddress,
    amount: params.amount,
  });

  // Generate unique nonce (32 bytes hex)
  const nonce = '0x' + Buffer.from(ethers.randomBytes(32)).toString('hex');

  // Validity window: 1 hour from now
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now.toString(); // Convert to string per x402 spec
  const validBefore = (now + 3600).toString(); // 1 hour, as string per x402 spec

  // Create authorization object
  const authorization: ERC3009Authorization = {
    from: params.agentAddress,
    to: params.recipientAddress,
    value: params.amount,
    validAfter,
    validBefore,
    nonce,
  };

  // Get chain ID
  const chainId = getChainId(params.network);

  // Create EIP-712 domain
  const domain = getEIP712Domain(params.usdcAddress, chainId);

  // Create wallet from private key
  const wallet = new ethers.Wallet(params.agentPrivateKey);

  // Sign using EIP-712
  const signature = await wallet.signTypedData(
    domain,
    ERC3009_TYPES,
    authorization
  );

  logger.info('ERC-3009 authorization created', {
    network: params.network,
    from: params.agentAddress,
    nonce: nonce.substring(0, 10) + '...',
    signatureLength: signature.length,
  });

  return {
    authorization,
    signature,
  };
}

/**
 * Create Solana payment authorization
 *
 * Note: Solana uses a different flow than EVM
 * - Agent creates partially-signed transaction
 * - Facilitator co-signs and broadcasts
 *
 * @param params - Authorization parameters
 * @returns Solana payment authorization
 */
export async function createSolanaAuthorization(params: {
  agentPrivateKey: string;
  agentAddress: string;
  recipientAddress: string;
  amount: string; // Atomic units
  network: NetworkId;
}): Promise<SolanaPaymentAuthorization> {
  logger.debug('Creating Solana payment authorization', {
    network: params.network,
    from: params.agentAddress,
    to: params.recipientAddress,
    amount: params.amount,
  });

  // TODO: Implement Solana signing
  // This requires:
  // 1. Import @solana/web3.js
  // 2. Create transfer instruction for USDC SPL token
  // 3. Create transaction
  // 4. Partially sign with agent's keypair
  // 5. Serialize to base64
  //
  // For now, throw error to prevent silent failures
  throw new Error('Solana payment authorization not yet implemented. Only EVM networks (Base, Ethereum) are currently supported.');

  // Future implementation:
  // const { Connection, Keypair, Transaction, PublicKey } = await import('@solana/web3.js');
  // const { createTransferInstruction, getAssociatedTokenAddress } = await import('@solana/spl-token');
  //
  // // Create partially-signed transaction
  // const connection = new Connection(getRpcUrl(params.network));
  // const fromPubkey = new PublicKey(params.agentAddress);
  // const toPubkey = new PublicKey(params.recipientAddress);
  //
  // // ... create and sign transaction
  //
  // return {
  //   transaction: base64EncodedTransaction,
  //   signers: [params.agentAddress],
  // };
}

/**
 * Create payment authorization for any supported network
 * Automatically detects network type and uses appropriate signing method
 *
 * @param params - Authorization parameters
 * @returns Payment authorization (EVM or Solana format)
 */
export async function createPaymentAuthorization(params: {
  agentPrivateKey: string;
  agentAddress: string;
  recipientAddress: string;
  amount: string;
  usdcAddress?: string; // Required for EVM, not used for Solana
  network: NetworkId;
}): Promise<PaymentAuthorization> {
  if (isEVMNetwork(params.network)) {
    if (!params.usdcAddress) {
      throw new Error('USDC address required for EVM networks');
    }
    return await createERC3009Authorization({
      agentPrivateKey: params.agentPrivateKey,
      agentAddress: params.agentAddress,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      usdcAddress: params.usdcAddress,
      network: params.network,
    });
  } else if (isSolanaNetwork(params.network)) {
    return await createSolanaAuthorization({
      agentPrivateKey: params.agentPrivateKey,
      agentAddress: params.agentAddress,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      network: params.network,
    });
  } else {
    throw new Error(`Unsupported network: ${params.network}`);
  }
}

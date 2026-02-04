/**
 * Wallet Service
 * Balance queries and Coinbase Onramp integration for agent funding
 */

import type { XacheClient } from '../XacheClient';
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

/**
 * Supported networks for balance queries
 */
export type WalletNetwork = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';

/**
 * USDC balance response
 */
export interface WalletBalance {
  /** Human-readable balance (e.g., 10.50) */
  balance: number;
  /** Balance in atomic units (6 decimals for USDC) */
  balanceRaw: string;
  /** Wallet address */
  address: string;
  /** Network queried */
  network: WalletNetwork;
}

/**
 * Options for generating Coinbase Onramp URL
 */
export interface OnrampUrlOptions {
  /** Suggested USD amount (optional) */
  amount?: number;
  /** Destination network: 'base' or 'solana' */
  network?: 'base' | 'solana';
  /** Fiat currency (default: 'USD') */
  currency?: 'USD' | 'EUR' | 'GBP';
}

/**
 * Options for funding check
 */
export interface NeedsFundingOptions {
  /** USD threshold below which funding is needed (default: 1.0) */
  threshold?: number;
  /** Specific network to check, or check default based on DID */
  network?: WalletNetwork;
}

/**
 * Funding check response
 */
export interface FundingStatus {
  /** Whether wallet needs funding */
  needsFunding: boolean;
  /** Current balance */
  balance: number;
  /** Threshold used for check */
  threshold: number;
  /** Network checked */
  network: WalletNetwork;
  /** Wallet address */
  address: string;
}

// USDC contract addresses
const USDC_ADDRESSES = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'solana': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;

// RPC endpoints
const RPC_ENDPOINTS = {
  'base': 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
  'solana': 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
} as const;

/**
 * Wallet service for balance queries and funding
 *
 * @example
 * ```typescript
 * const client = new XacheClient({ did, privateKey });
 *
 * // Check balance
 * const balance = await client.wallet.getBalance('base-sepolia');
 * console.log(`Balance: $${balance.balance}`);
 *
 * // Get Coinbase Onramp URL
 * if (balance.balance < 1) {
 *   const url = await client.wallet.getOnrampUrl({ amount: 10 });
 *   console.log(`Fund wallet: ${url}`);
 * }
 *
 * // Check if funding needed
 * const status = await client.wallet.needsFunding({ threshold: 5 });
 * if (status.needsFunding) {
 *   console.log('Wallet needs funding!');
 * }
 * ```
 */
export class WalletService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Get USDC balance on the specified network
   *
   * @param network - Network to query (defaults based on DID chain type)
   * @returns Balance information
   *
   * @example
   * ```typescript
   * const balance = await client.wallet.getBalance('base-sepolia');
   * console.log(`Have: $${balance.balance.toFixed(6)} USDC`);
   * console.log(`Address: ${balance.address}`);
   * ```
   */
  async getBalance(network?: WalletNetwork): Promise<WalletBalance> {
    const config = this.client.getConfig();
    const { address, chainType } = this.parseAddress(config.did);

    // Default network based on DID chain type
    const targetNetwork = network ?? this.getDefaultNetwork(chainType);

    // Validate network matches chain type (or allow cross-chain query)
    this.validateNetworkForChain(targetNetwork, chainType);

    if (targetNetwork === 'solana' || targetNetwork === 'solana-devnet') {
      return this.getSolanaBalance(address, targetNetwork);
    } else {
      return this.getEVMBalance(address, targetNetwork);
    }
  }

  /**
   * Get Coinbase Onramp URL for funding the wallet
   *
   * Returns a URL that opens Coinbase Onramp pre-filled with the wallet address
   * and USDC as the destination asset.
   *
   * @param options - Onramp configuration options
   * @returns Coinbase Onramp URL
   *
   * @example
   * ```typescript
   * const url = await client.wallet.getOnrampUrl({
   *   amount: 25,
   *   network: 'base',
   * });
   *
   * // Open in browser or display to user
   * console.log(`Fund your wallet: ${url}`);
   * ```
   */
  async getOnrampUrl(options: OnrampUrlOptions = {}): Promise<string> {
    const config = this.client.getConfig();
    const { address, chainType } = this.parseAddress(config.did);

    // Determine network - default based on chain type
    const network = options.network ?? (chainType === 'sol' ? 'solana' : 'base');

    // Build Coinbase Onramp URL
    const params = new URLSearchParams();

    // App ID for tracking
    params.set('appId', 'xache-protocol');

    // Destination address - format: {"address": ["network1", "network2"]}
    const addresses = JSON.stringify({ [address]: [network] });
    params.set('addresses', addresses);

    // Asset selection - USDC only
    params.set('assets', JSON.stringify(['USDC']));

    // Optional preset amount
    if (options.amount) {
      params.set('presetFiatAmount', options.amount.toString());
    }

    // Currency (default USD)
    if (options.currency) {
      params.set('fiatCurrency', options.currency);
    }

    return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
  }

  /**
   * Check if wallet needs funding based on threshold
   *
   * @param options - Funding check options
   * @returns Funding status with balance and threshold info
   *
   * @example
   * ```typescript
   * const status = await client.wallet.needsFunding({ threshold: 5 });
   *
   * if (status.needsFunding) {
   *   console.log(`Balance $${status.balance} is below threshold $${status.threshold}`);
   *   const url = await client.wallet.getOnrampUrl({ amount: 10 });
   *   console.log(`Please fund: ${url}`);
   * }
   * ```
   */
  async needsFunding(options: NeedsFundingOptions = {}): Promise<FundingStatus> {
    const threshold = options.threshold ?? 1.0;
    const config = this.client.getConfig();
    const { chainType } = this.parseAddress(config.did);

    // Determine network
    const network = options.network ?? this.getDefaultNetwork(chainType);

    // Get balance
    const balanceInfo = await this.getBalance(network);

    return {
      needsFunding: balanceInfo.balance < threshold,
      balance: balanceInfo.balance,
      threshold,
      network,
      address: balanceInfo.address,
    };
  }

  /**
   * Get balance on all supported networks for this wallet
   *
   * @returns Array of balances across networks
   *
   * @example
   * ```typescript
   * const balances = await client.wallet.getAllBalances();
   * for (const b of balances) {
   *   console.log(`${b.network}: $${b.balance}`);
   * }
   * ```
   */
  async getAllBalances(): Promise<WalletBalance[]> {
    const config = this.client.getConfig();
    const { chainType } = this.parseAddress(config.did);

    // Query networks based on chain type
    if (chainType === 'sol') {
      const [mainnet, devnet] = await Promise.all([
        this.getBalance('solana').catch(() => null),
        this.getBalance('solana-devnet').catch(() => null),
      ]);
      return [mainnet, devnet].filter((b): b is WalletBalance => b !== null);
    } else {
      const [mainnet, sepolia] = await Promise.all([
        this.getBalance('base').catch(() => null),
        this.getBalance('base-sepolia').catch(() => null),
      ]);
      return [mainnet, sepolia].filter((b): b is WalletBalance => b !== null);
    }
  }

  // ========== Private Methods ==========

  /**
   * Parse DID to extract address and chain type
   */
  private parseAddress(did: string): { address: string; chainType: 'evm' | 'sol' } {
    // DID format: did:agent:<evm|sol>:<address>
    const parts = did.split(':');
    if (parts.length < 4) {
      throw new Error(`Invalid DID format: ${did}`);
    }

    const chainType = parts[2] as 'evm' | 'sol';
    const address = parts[3];

    if (chainType !== 'evm' && chainType !== 'sol') {
      throw new Error(`Unknown chain type in DID: ${chainType}`);
    }

    return { address, chainType };
  }

  /**
   * Get default network based on chain type
   */
  private getDefaultNetwork(chainType: 'evm' | 'sol'): WalletNetwork {
    // Default to testnet for safety
    return chainType === 'sol' ? 'solana-devnet' : 'base-sepolia';
  }

  /**
   * Validate network is compatible with chain type
   */
  private validateNetworkForChain(network: WalletNetwork, chainType: 'evm' | 'sol'): void {
    const isSolanaNetwork = network === 'solana' || network === 'solana-devnet';
    const isEVMNetwork = network === 'base' || network === 'base-sepolia';

    if (chainType === 'sol' && isEVMNetwork) {
      throw new Error(
        `Cannot query EVM network '${network}' with Solana DID. ` +
        `The DID address is a Solana public key.`
      );
    }

    if (chainType === 'evm' && isSolanaNetwork) {
      throw new Error(
        `Cannot query Solana network '${network}' with EVM DID. ` +
        `The DID address is an Ethereum address.`
      );
    }
  }

  /**
   * Get USDC balance on EVM (Base)
   */
  private async getEVMBalance(address: string, network: 'base' | 'base-sepolia'): Promise<WalletBalance> {
    const rpcUrl = RPC_ENDPOINTS[network];
    const usdcAddress = USDC_ADDRESSES[network];

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // ERC-20 balanceOf ABI
    const abi = ['function balanceOf(address account) view returns (uint256)'];
    const usdc = new ethers.Contract(usdcAddress, abi, provider);

    try {
      const balanceRaw: bigint = await usdc.balanceOf(address);
      const balance = Number(balanceRaw) / 1_000_000; // USDC has 6 decimals

      return {
        balance,
        balanceRaw: balanceRaw.toString(),
        address,
        network,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to query EVM balance on ${network}: ${message}`);
    }
  }

  /**
   * Get USDC balance on Solana
   */
  private async getSolanaBalance(address: string, network: 'solana' | 'solana-devnet'): Promise<WalletBalance> {
    const rpcUrl = RPC_ENDPOINTS[network];
    const usdcMint = USDC_ADDRESSES[network];

    const connection = new Connection(rpcUrl, 'confirmed');
    const owner = new PublicKey(address);
    const mint = new PublicKey(usdcMint);

    try {
      // Get Associated Token Account address
      const ata = await getAssociatedTokenAddress(mint, owner);

      // Try to get account info
      const account = await getAccount(connection, ata);
      const balanceRaw = account.amount.toString();
      const balance = Number(account.amount) / 1_000_000; // USDC has 6 decimals

      return {
        balance,
        balanceRaw,
        address,
        network,
      };
    } catch (error) {
      // Token account doesn't exist = zero balance
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('could not find account') || message.includes('Account does not exist')) {
        return {
          balance: 0,
          balanceRaw: '0',
          address,
          network,
        };
      }
      throw new Error(`Failed to query Solana balance on ${network}: ${message}`);
    }
  }
}

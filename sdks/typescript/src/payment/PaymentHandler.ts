/**
 * Payment Handler for x402 Payment Flow with CDP
 *
 * Implements ERC-3009 gasless transfers for USDC payments via CDP
 * Per CDP specification: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/
 *
 * Supports x402 v1 and v2:
 * - v1: X-PAYMENT header (legacy)
 * - v2: PAYMENT-SIGNATURE header (modern)
 *
 * Flow:
 * 1. Receive 402 Payment Required with payment requirements
 * 2. Create ERC-3009 receiveWithAuthorization signature (off-chain, gasless)
 * 3. Return payment header with authorization + signature for CDP to settle
 * 4. CDP executes the on-chain transfer using the authorization
 */

import { ethers } from 'ethers';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as solanaWeb3 from '@solana/web3.js';

/**
 * Payment challenge from 402 response
 */
export interface PaymentChallenge {
  challengeId: string;
  amount: string; // Atomic units (e.g., "1000" for $0.001)
  network: string; // Network ID (base-sepolia, solana-devnet, etc.)
  payTo: string; // Recipient address
  asset: string; // Token contract address (USDC)
  description: string;
  resource: string; // API endpoint URL (e.g., "https://api.xache.xyz/v1/memory/store")
  feePayer?: string; // Fee payer address for Solana transactions (from PaymentRequirements.extra.feePayer)
}

/**
 * x402 protocol version
 * - 1: Legacy X-PAYMENT header
 * - 2: Modern PAYMENT-SIGNATURE header
 */
export type X402Version = 1 | 2;

/**
 * x402 header names by version
 */
export const X402_HEADER_NAMES = {
  1: {
    payment: 'X-PAYMENT',
    response: 'X-PAYMENT-RESPONSE',
  },
  2: {
    payment: 'PAYMENT-SIGNATURE',
    response: 'PAYMENT-RESPONSE',
    required: 'PAYMENT-REQUIRED',
  },
} as const;

/**
 * Payment result with payment header
 */
export interface PaymentResult {
  success: boolean;
  /** Base64-encoded payment payload */
  paymentHeader?: string;
  /** Header name to use (X-PAYMENT for v1, PAYMENT-SIGNATURE for v2) */
  headerName?: string;
  /** x402 version used */
  version?: X402Version;
  /** @deprecated Use paymentHeader instead */
  xPaymentHeader?: string;
  error?: string;
}

/**
 * ERC-3009 USDC ABI for receiveWithAuthorization
 * See: https://eips.ethereum.org/EIPS/eip-3009
 */
const USDC_ERC3009_ABI = [
  // ERC-3009: Receive with authorization (gasless transfer)
  'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  // Query functions
  'function balanceOf(address account) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
];

/**
 * EIP-712 Domain for USDC ERC-3009
 */
interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * ERC-3009 ReceiveWithAuthorization parameters
 */
interface ReceiveAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/**
 * Custom RPC URL configuration
 */
export interface RpcUrlConfig {
  /** EVM RPC URLs by network name */
  evm?: Record<string, string>;
  /** Solana RPC URLs by network name */
  solana?: Record<string, string>;
}

/**
 * Payment handler with CDP ERC-3009 support
 */
export class PaymentHandler {
  private readonly privateKey: string;
  private readonly debug: boolean;
  private readonly x402Version: X402Version;
  private readonly customRpcUrls: RpcUrlConfig;

  /**
   * Create a payment handler
   * @param privateKey - Wallet private key for signing
   * @param debug - Enable debug logging
   * @param x402Version - x402 protocol version (default: 2)
   * @param rpcUrls - Custom RPC URL overrides
   */
  constructor(
    privateKey: string,
    debug: boolean = false,
    x402Version: X402Version = 2,
    rpcUrls?: RpcUrlConfig
  ) {
    this.privateKey = privateKey;
    this.debug = debug;
    this.x402Version = x402Version;
    this.customRpcUrls = rpcUrls || {};
  }

  /**
   * Get the header name to use for the payment
   */
  getPaymentHeaderName(): string {
    return X402_HEADER_NAMES[this.x402Version].payment;
  }

  /**
   * Get the x402 version being used
   */
  getVersion(): X402Version {
    return this.x402Version;
  }

  /**
   * Handle 402 payment challenge automatically
   *
   * Creates ERC-3009 authorization and returns X-PAYMENT header for CDP
   */
  async handlePayment(challenge: PaymentChallenge): Promise<PaymentResult> {
    try {
      if (this.debug) {
        console.log('[PaymentHandler] Processing payment challenge:', {
          challengeId: challenge.challengeId,
          amount: challenge.amount,
          network: challenge.network,
          payTo: challenge.payTo,
        });
      }

      // Determine network type
      if (challenge.network.includes('solana')) {
        return await this.handleSolanaPayment(challenge);
      } else {
        return await this.handleEVMPaymentWithERC3009(challenge);
      }
    } catch (error) {
      if (this.debug) {
        console.error('[PaymentHandler] Payment error:', error);
      }

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle EVM payment using ERC-3009 gasless transfer
   * Creates signed authorization for CDP to execute on-chain
   */
  private async handleEVMPaymentWithERC3009(challenge: PaymentChallenge): Promise<PaymentResult> {
    try {
      // Determine RPC endpoint based on network
      const rpcUrl = this.getEVMRpcUrl(challenge.network);
      const chainId = this.getChainId(challenge.network);

      if (this.debug) {
        console.log('[PaymentHandler] Creating ERC-3009 authorization:', {
          network: challenge.network,
          chainId,
          rpcUrl,
          usdcContract: challenge.asset,
        });
      }

      // Create provider and wallet
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);

      // Create USDC contract interface
      const usdcContract = new ethers.Contract(challenge.asset, USDC_ERC3009_ABI, provider);

      // Check USDC balance
      const usdcBalance = await usdcContract.balanceOf(wallet.address);
      const requiredAmount = BigInt(challenge.amount);

      if (this.debug) {
        console.log('[PaymentHandler] Balance check:', {
          address: wallet.address,
          usdcBalance: usdcBalance.toString(),
          requiredAmount: challenge.amount,
        });
      }

      if (usdcBalance < requiredAmount) {
        const balanceUSD = Number(usdcBalance) / 1_000_000;
        const requiredUSD = Number(requiredAmount) / 1_000_000;

        throw new Error(
          `Insufficient USDC balance. ` +
          `Have: $${balanceUSD.toFixed(6)} USDC, Need: $${requiredUSD.toFixed(6)} USDC. ` +
          `Please fund wallet ${wallet.address} with testnet USDC on ${challenge.network}.`
        );
      }

      // Generate unique nonce for this authorization
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      // Check if authorization already exists (safety check)
      const authState = await usdcContract.authorizationState(wallet.address, nonce);
      if (authState) {
        throw new Error('Authorization nonce already used');
      }

      // Set validity window: valid immediately for next 5 minutes
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now;
      const validBefore = now + 300; // 5 minutes

      // Create authorization parameters
      const authorization: ReceiveAuthorization = {
        from: wallet.address,
        to: challenge.payTo,
        value: challenge.amount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      };

      if (this.debug) {
        console.log('[PaymentHandler] Authorization parameters:', {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        });
      }

      // Get USDC EIP-712 domain
      // CRITICAL: Testnets use "USDC", Mainnets use "USD Coin"
      const usdcName = challenge.network.includes('sepolia') ? 'USDC' : 'USD Coin';
      const domain: EIP712Domain = {
        name: usdcName,
        version: '2',
        chainId: chainId,
        verifyingContract: challenge.asset,
      };

      // EIP-712 type definition for TransferWithAuthorization (per CDP spec)
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      // Sign the authorization using EIP-712
      const signature = await wallet.signTypedData(domain, types, authorization);

      // Split signature into v, r, s components
      const sig = ethers.Signature.from(signature);

      if (this.debug) {
        console.log('[PaymentHandler] EIP-712 signature created:', {
          signature,
          v: sig.v,
          r: sig.r,
          s: sig.s,
        });
      }

      // Build CDP-compliant payment payload per x402 spec
      // Structure from CDP docs:
      // {
      //   "x402Version": 1 | 2,
      //   "paymentPayload": {
      //     "scheme": "exact",
      //     "network": "base-sepolia",
      //     "payload": {
      //       "authorization": { ... },
      //       "signature": "0x..."
      //     }
      //   },
      //   "paymentRequirements": { ... }
      // }

      // Create the full payment payload
      // Per CDP OpenAPI spec: "signature" BEFORE "authorization" in payload
      const xPaymentPayload = {
        x402Version: this.x402Version,
        paymentPayload: {
          scheme: 'exact',
          network: challenge.network,
          payload: {
            signature: signature,  // FIRST per CDP OpenAPI spec example
            authorization: {
              from: authorization.from,
              to: authorization.to,
              value: authorization.value,
              validAfter: authorization.validAfter,
              validBefore: authorization.validBefore,
              nonce: authorization.nonce,
            },
            // Include EIP-712 domain for CDP to verify signature
            domain: {
              name: domain.name,
              version: domain.version,
              chainId: domain.chainId,
              verifyingContract: domain.verifyingContract,
            },
          },
        },
        // Include payment requirements for CDP validation
        // CDP requires mimeType, maxTimeoutSeconds, AND extra with FULL EIP-712 domain
        paymentRequirements: {
          scheme: 'exact',
          network: challenge.network,
          maxAmountRequired: challenge.amount,
          resource: challenge.resource,
          description: challenge.description,
          mimeType: 'application/json',
          payTo: challenge.payTo,
          maxTimeoutSeconds: 60,
          asset: challenge.asset,
          // CRITICAL: Include FULL EIP-712 domain used for signing
          // CDP needs this to verify the signature and extract payer address
          extra: {
            name: domain.name,
            version: domain.version,
            chainId: domain.chainId,
            verifyingContract: domain.verifyingContract,
          },
        },
      };

      // Encode as base64 JSON per x402 spec
      const paymentHeader = Buffer.from(JSON.stringify(xPaymentPayload)).toString('base64');
      const headerName = this.getPaymentHeaderName();

      if (this.debug) {
        console.log('[PaymentHandler] ERC-3009 authorization complete!');
        console.log(`[PaymentHandler] x402 v${this.x402Version} ${headerName} payload:`, JSON.stringify(xPaymentPayload, null, 2));
      }

      return {
        success: true,
        paymentHeader,
        headerName,
        version: this.x402Version,
        // Backward compatibility
        xPaymentHeader: paymentHeader,
      };
    } catch (error) {
      if (this.debug) {
        console.error('[PaymentHandler] ERC-3009 authorization failed:', error);
      }

      throw error;
    }
  }

  /**
   * Handle Solana payment (Solana, Solana Devnet)
   * Uses x402 SVM specification for correct CDP integration
   */
  private async handleSolanaPayment(challenge: PaymentChallenge): Promise<PaymentResult> {
    try {
      const { SolanaPaymentHandler } = await import('./SolanaPaymentHandler');

      // Get RPC URL for network
      const rpcUrl = SolanaPaymentHandler.getRpcUrl(challenge.network as any);

      if (this.debug) {
        console.log('[PaymentHandler] Creating x402 SVM payment:', {
          network: challenge.network,
          rpcUrl,
          payTo: challenge.payTo,
          amount: challenge.amount,
        });
      }

      // Create Solana payment handler with same x402 version
      const handler = new SolanaPaymentHandler(rpcUrl, this.x402Version);

      // Create keypair from private key
      const { Keypair } = await import('@solana/web3.js');
      const keypair = Keypair.fromSecretKey(Buffer.from(this.privateKey, 'hex'));

      // Validate feePayer is present (required for x402 SVM)
      if (!challenge.feePayer) {
        throw new Error(
          'Solana x402 SVM payments require feePayer address from PaymentRequirements.extra.feePayer. ' +
          'This should be returned in the 402 response. The CDP facilitator address is used as fee payer.'
        );
      }

      // Create x402 SVM payment challenge with feePayer
      const x402Challenge = {
        scheme: 'exact' as const,
        network: challenge.network,
        maxAmountRequired: challenge.amount,
        resource: challenge.resource,
        description: challenge.description,
        mimeType: 'application/json',
        payTo: challenge.payTo,
        maxTimeoutSeconds: 120,
        asset: challenge.asset,
        // CRITICAL: feePayer must be CDP facilitator's Solana address (from extra.feePayer)
        // The agent signs for the token transfer, CDP adds signature as fee payer
        feePayer: challenge.feePayer,
      };

      if (this.debug) {
        console.log('[PaymentHandler] x402 SVM challenge:', {
          ...x402Challenge,
          feePayer: challenge.feePayer,
        });
      }

      const paymentPayload = await handler.createPaymentPayload(
        x402Challenge,
        keypair
      );

      // Encode the full x402 structure as base64 JSON for payment header
      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      const headerName = this.getPaymentHeaderName();

      if (this.debug) {
        console.log('[PaymentHandler] x402 SVM payment payload created');
        console.log(`[PaymentHandler] x402 v${this.x402Version} header: ${headerName}`);
        console.log('[PaymentHandler] Payload structure:', Object.keys(paymentPayload));
      }

      return {
        success: true,
        paymentHeader,
        headerName,
        version: this.x402Version,
        // Backward compatibility
        xPaymentHeader: paymentHeader,
      };
    } catch (error) {
      if (this.debug) {
        console.error('[PaymentHandler] Solana payment failed:', error);
      }

      throw error;
    }
  }

  /**
   * Get EVM RPC URL based on network
   */
  private getEVMRpcUrl(network: string): string {
    // Check for custom RPC URL first
    if (this.customRpcUrls.evm?.[network]) {
      return this.customRpcUrls.evm[network];
    }

    switch (network) {
      case 'base-sepolia':
        return 'https://sepolia.base.org';
      case 'base':
        return 'https://mainnet.base.org';
      default:
        throw new Error(`Unsupported EVM network: ${network}. Use custom RPC URLs via rpcUrls config.`);
    }
  }

  /**
   * Get chain ID for EIP-712 signing
   */
  private getChainId(network: string): number {
    switch (network) {
      case 'base-sepolia':
        return 84532;
      case 'base':
        return 8453;
      default:
        throw new Error(`Unknown chain ID for network: ${network}`);
    }
  }

  /**
   * Get Solana RPC URL based on network
   */
  private getSolanaRpcUrl(network: string): string {
    // Check for custom RPC URL first
    if (this.customRpcUrls.solana?.[network]) {
      return this.customRpcUrls.solana[network];
    }

    switch (network) {
      case 'solana-devnet':
        return 'https://api.devnet.solana.com';
      case 'solana':
        return 'https://api.mainnet-beta.solana.com';
      default:
        throw new Error(`Unsupported Solana network: ${network}. Use custom RPC URLs via rpcUrls config.`);
    }
  }

  /**
   * Get associated token account address and create if it doesn't exist
   */
  private async getOrCreateTokenAccount(
    connection: Connection,
    payer: solanaWeb3.Keypair,
    mint: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

    // Derive associated token address (standard Solana program derivation)
    const [tokenAccount] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Check if account exists
    const accountInfo = await connection.getAccountInfo(tokenAccount);

    if (!accountInfo) {
      // Account doesn't exist - create it
      if (this.debug) {
        console.log(`[PaymentHandler] Creating associated token account for ${owner.toBase58()}`);
      }

      const transaction = new Transaction().add(
        this.createAssociatedTokenAccountInstruction(
          payer.publicKey,
          tokenAccount,
          owner,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;
      transaction.sign(payer);

      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature);

      if (this.debug) {
        console.log(`[PaymentHandler] Associated token account created: ${tokenAccount.toBase58()}`);
      }
    }

    return tokenAccount;
  }

  /**
   * Create instruction to create an associated token account
   */
  private createAssociatedTokenAccountInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey,
    associatedTokenProgramId: PublicKey
  ): TransactionInstruction {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // System Program
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: associatedTokenProgramId,
      data: Buffer.alloc(0), // No data needed for ATA creation
    });
  }

  /**
   * Create SPL token transfer instruction
   */
  private async createSPLTransferInstruction(
    source: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: bigint
  ): Promise<TransactionInstruction> {
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // Create transfer instruction data
    const dataLayout = Buffer.alloc(9);
    dataLayout.writeUInt8(3, 0); // Transfer instruction
    dataLayout.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: dataLayout,
    });
  }
}

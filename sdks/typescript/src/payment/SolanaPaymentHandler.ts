/**
 * Solana Payment Handler for x402 Protocol
 * Implements correct x402 SVM specification for Solana CDP payments
 *
 * Reference: https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md
 *
 * CRITICAL x402 SVM Rules:
 * 1. Transaction MUST have EXACTLY 3 instructions in order:
 *    - ComputeBudget SetComputeUnitLimit (discriminator 2)
 *    - ComputeBudget SetComputeUnitPrice (discriminator 3)
 *    - SPL Token TransferChecked
 * 2. Fee payer (CDP facilitator) CANNOT appear in any instruction's accounts
 * 3. Fee payer CANNOT be the authority or source of funds
 * 4. Client creates partially-signed tx, facilitator adds fee payer signature
 * 5. Compute unit price capped at 5 lamports per compute unit
 */

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

/**
 * x402 Payment Challenge (from 402 response)
 */
export interface X402Challenge {
  scheme: 'exact' | 'range';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  feePayer: string; // REQUIRED: CDP facilitator's fee payer address (from PaymentRequirements.extra.feePayer)
}

/**
 * x402 protocol version
 */
export type X402Version = 1 | 2;

/**
 * x402 SVM Payment Payload (sent to facilitator)
 * Per x402 spec and CDP API: Only transaction field in payload
 * The partially-signed transaction is self-contained with signatures embedded
 */
export interface X402SolanaPaymentPayload {
  x402Version: X402Version;  // Top-level only!
  paymentPayload: {
    // NO x402Version here - only at top level
    scheme: 'exact' | 'range';
    network: string;
    payload: {
      /** Base64-encoded partially signed Solana transaction (signatures embedded) */
      transaction: string;
    };
  };
  paymentRequirements: {
    scheme: 'exact' | 'range';
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
  };
}

/**
 * Solana Payment Handler
 * Creates x402 SVM-compliant payment payloads
 */
export class SolanaPaymentHandler {
  private connection: Connection;
  private x402Version: X402Version;

  /**
   * Create a Solana payment handler
   * @param rpcUrl - Solana RPC URL
   * @param x402Version - x402 protocol version (default: 2)
   */
  constructor(rpcUrl: string, x402Version: X402Version = 2) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.x402Version = x402Version;
  }

  /**
   * Get the x402 version being used
   */
  getVersion(): X402Version {
    return this.x402Version;
  }

  /**
   * Create x402 SVM payment payload
   *
   * Per x402 SVM spec (https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md):
   *
   * Transaction MUST have EXACTLY 3 instructions in this order:
   * 1. ComputeBudget SetComputeUnitLimit (discriminator 2)
   * 2. ComputeBudget SetComputeUnitPrice (discriminator 3)
   * 3. SPL Token TransferChecked
   *
   * CRITICAL CONSTRAINTS:
   * - Fee payer (CDP facilitator) CANNOT appear in any instruction's accounts
   * - Fee payer CANNOT be the authority or source of funds
   * - Compute unit price max 5 lamports per compute unit (5,000,000 microlamports)
   * - Transfer destination MUST be ATA PDA for (owner=payTo, mint=asset)
   * - Transfer amount MUST exactly match maxAmountRequired
   *
   * The agent signs only for the TransferChecked (as token owner/authority).
   * CDP facilitator adds their signature as fee payer when settling.
   */
  async createPaymentPayload(
    challenge: X402Challenge,
    agentKeypair: Keypair,
    tokenDecimals: number = 6 // USDC has 6 decimals
  ): Promise<X402SolanaPaymentPayload> {
    try {
      // Validate fee payer is provided (required for x402 SVM)
      if (!challenge.feePayer) {
        throw new Error(
          'x402 SVM requires feePayer address from PaymentRequirements.extra.feePayer. ' +
          'This should be the CDP facilitator address.'
        );
      }

      const tokenMint = new PublicKey(challenge.asset);
      const recipientPubkey = new PublicKey(challenge.payTo);
      const feePayerPubkey = new PublicKey(challenge.feePayer);

      // Verify fee payer is NOT the agent (it must be CDP facilitator)
      if (feePayerPubkey.equals(agentKeypair.publicKey)) {
        throw new Error(
          'feePayer cannot be the agent. Per x402 SVM spec, CDP facilitator must be the fee payer.'
        );
      }

      // Get associated token accounts
      // Source: Agent's ATA (agent is the owner/authority)
      const senderATA = await getAssociatedTokenAddress(
        tokenMint,
        agentKeypair.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Destination: Recipient's ATA (must already exist per x402 spec - no ATA creation allowed)
      const recipientATA = await getAssociatedTokenAddress(
        tokenMint,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Verify recipient ATA exists (x402 spec doesn't allow ATA creation in payment tx)
      const recipientATAInfo = await this.connection.getAccountInfo(recipientATA);
      if (!recipientATAInfo) {
        throw new Error(
          `Recipient token account does not exist: ${recipientATA.toBase58()}. ` +
          `Per x402 SVM spec, the recipient ATA must be pre-created. ` +
          `Recipient (payTo): ${challenge.payTo}`
        );
      }

      // Build EXACTLY 3 instructions per x402 SVM spec
      const instructions = [
        // 1. ComputeBudget SetComputeUnitLimit (discriminator 2)
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200_000,
        }),

        // 2. ComputeBudget SetComputeUnitPrice (discriminator 3)
        // Max 5 lamports per CU = 5,000,000 microlamports (per x402 spec)
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1_000, // Conservative value, well under max
        }),

        // 3. SPL Token TransferChecked
        // CRITICAL: Fee payer (feePayerPubkey) does NOT appear in this instruction's accounts
        // Only: source, mint, destination, owner (agent), and TOKEN_PROGRAM_ID
        createTransferCheckedInstruction(
          senderATA,                            // source (agent's token account)
          tokenMint,                            // mint
          recipientATA,                         // destination (recipient's token account)
          agentKeypair.publicKey,               // owner/authority (agent signs for this)
          BigInt(challenge.maxAmountRequired),  // amount (must match exactly)
          tokenDecimals,                        // decimals
          [],                                   // multiSigners (empty for single signer)
          TOKEN_PROGRAM_ID
        ),
      ];

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');

      // Create V0 transaction message
      // Fee payer is CDP facilitator - they will add their signature when settling
      const messageV0 = new TransactionMessage({
        payerKey: feePayerPubkey,  // CDP facilitator pays fees (adds signature later)
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();  // No lookup tables needed for this simple tx

      const transaction = new VersionedTransaction(messageV0);

      // Agent signs for the TransferChecked instruction (as token owner/authority)
      // This creates a PARTIALLY-SIGNED transaction
      // CDP facilitator will add their signature as fee payer when settling
      transaction.sign([agentKeypair]);

      // Serialize to base64 for payment header (X-PAYMENT v1 or PAYMENT-SIGNATURE v2)
      const serializedTx = transaction.serialize();
      const base64Transaction = Buffer.from(serializedTx).toString('base64');

      // Create x402 SVM payload per CDP API spec
      const payload: X402SolanaPaymentPayload = {
        x402Version: this.x402Version,
        paymentPayload: {
          scheme: challenge.scheme,
          network: challenge.network,
          payload: {
            transaction: base64Transaction,
          },
        },
        paymentRequirements: {
          scheme: challenge.scheme,
          network: challenge.network,
          maxAmountRequired: challenge.maxAmountRequired,
          resource: challenge.resource,
          description: challenge.description,
          mimeType: challenge.mimeType,
          payTo: challenge.payTo,
          maxTimeoutSeconds: challenge.maxTimeoutSeconds,
          asset: challenge.asset,
        },
      };

      return payload;
    } catch (error) {
      throw new Error(
        `Failed to create Solana payment payload: ${(error as Error).message}`
      );
    }
  }

  /**
   * Verify transaction on Solana blockchain
   */
  async verifyTransaction(txHash: string): Promise<{
    confirmed: boolean;
    amount?: string;
    from?: string;
    to?: string;
  }> {
    try {
      const confirmation = await this.connection.getSignatureStatus(txHash, {
        searchTransactionHistory: true,
      });

      if (!confirmation.value) {
        return { confirmed: false };
      }

      const isConfirmed =
        confirmation.value.confirmationStatus === 'confirmed' ||
        confirmation.value.confirmationStatus === 'finalized';

      return {
        confirmed: isConfirmed,
      };
    } catch (error) {
      return { confirmed: false };
    }
  }

  /**
   * Get Solana RPC URL for network
   */
  static getRpcUrl(network: string): string {
    switch (network) {
      case 'solana':
        return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      case 'solana-devnet':
        return (
          process.env.SOLANA_DEVNET_RPC_URL ||
          'https://api.devnet.solana.com'
        );
      default:
        throw new Error(`Unsupported Solana network: ${network}`);
    }
  }
}

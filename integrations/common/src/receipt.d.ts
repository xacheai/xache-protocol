/**
 * Receipt generation and verification for Xache Protocol
 * Based on LLD Section 4.3 (Receipt Chain)
 *
 * Note: These are legacy utility functions for receipt operations.
 * They use simplified types different from the main Receipt type in @xache/types.
 */
import type { NetworkId } from '@xache/types';
/**
 * Legacy receipt structure for utility functions
 */
export interface LegacyReceipt {
    receiptId: string;
    agentId: string;
    operationType: string;
    operationId: string;
    amountPaid: string;
    networkId: NetworkId;
    txHash?: string;
    timestamp: number;
    metadata: Record<string, any>;
    checksum: string;
    merkleRoot: string | null;
    blockNumber: number | null;
    blockTimestamp: number | null;
    verified: boolean;
}
/**
 * Receipt proof structure
 */
export interface ReceiptProof {
    receiptId: string;
    merkleRoot: string;
    siblingHashes: string[];
}
/**
 * Generate receipt ID
 */
export declare function generateReceiptId(): string;
/**
 * Generate receipt for operation
 */
export declare function generateReceipt(params: {
    agentId: string;
    operationType: string;
    operationId: string;
    amountPaid: string;
    networkId: NetworkId;
    txHash?: string;
    metadata?: Record<string, any>;
}): LegacyReceipt;
/**
 * Verify receipt checksum
 */
export declare function verifyReceiptChecksum(receipt: LegacyReceipt): boolean;
/**
 * Create Merkle proof for receipt
 */
export declare function createMerkleProof(receiptId: string, siblingHashes: string[], merkleRoot: string): ReceiptProof;
/**
 * Verify Merkle proof
 */
export declare function verifyMerkleProof(receiptChecksum: string, proof: ReceiptProof): boolean;
/**
 * Anchor receipt to blockchain
 */
export declare function anchorReceipt(receipt: LegacyReceipt, merkleRoot: string, blockNumber: number, blockTimestamp: number): LegacyReceipt;
/**
 * Batch receipts for anchoring
 */
export declare function batchReceiptsForAnchoring(receipts: LegacyReceipt[]): {
    merkleRoot: string;
    proofs: ReceiptProof[];
};
/**
 * Get receipt summary
 */
export declare function getReceiptSummary(receipt: LegacyReceipt): {
    id: string;
    operation: string;
    amount: string;
    network: NetworkId;
    timestamp: string;
    verified: boolean;
    anchored: boolean;
};
/**
 * Filter receipts by time range
 */
export declare function filterReceiptsByTimeRange(receipts: LegacyReceipt[], startTimestamp: number, endTimestamp: number): LegacyReceipt[];
/**
 * Calculate total amount from receipts
 */
export declare function calculateTotalAmount(receipts: LegacyReceipt[]): string;
/**
 * Group receipts by network
 */
export declare function groupReceiptsByNetwork(receipts: LegacyReceipt[]): Record<NetworkId, LegacyReceipt[]>;
/**
 * Group receipts by operation type
 */
export declare function groupReceiptsByOperation(receipts: LegacyReceipt[]): Record<string, LegacyReceipt[]>;
//# sourceMappingURL=receipt.d.ts.map
/**
 * Receipt generation and verification for Xache Protocol
 * Based on LLD Section 4.3 (Receipt Chain)
 *
 * Note: These are legacy utility functions for receipt operations.
 * They use simplified types different from the main Receipt type in @xache/types.
 */
import { calculateChecksum } from '@xache/crypto';
/**
 * Generate receipt ID
 */
export function generateReceiptId() {
    // Format: rcpt_<timestamp>_<random>
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `rcpt_${timestamp}_${random}`;
}
/**
 * Generate receipt for operation
 */
export function generateReceipt(params) {
    const receiptId = generateReceiptId();
    const timestamp = Math.floor(Date.now() / 1000);
    // Create receipt data
    const receiptData = {
        receiptId,
        agentId: params.agentId,
        operationType: params.operationType,
        operationId: params.operationId,
        amountPaid: params.amountPaid,
        networkId: params.networkId,
        txHash: params.txHash,
        timestamp,
        metadata: params.metadata || {},
    };
    // Calculate checksum
    const dataString = JSON.stringify(receiptData);
    const checksum = calculateChecksum(Buffer.from(dataString));
    const receipt = {
        ...receiptData,
        checksum,
        merkleRoot: null, // Will be set during anchoring
        blockNumber: null,
        blockTimestamp: null,
        verified: false,
    };
    return receipt;
}
/**
 * Verify receipt checksum
 */
export function verifyReceiptChecksum(receipt) {
    // Extract checksum
    const { checksum, merkleRoot, blockNumber, blockTimestamp, verified, ...data } = receipt;
    // Recalculate checksum
    const dataString = JSON.stringify(data);
    const calculatedChecksum = calculateChecksum(Buffer.from(dataString));
    return calculatedChecksum === checksum;
}
/**
 * Create Merkle proof for receipt
 */
export function createMerkleProof(receiptId, siblingHashes, merkleRoot) {
    return {
        receiptId,
        merkleRoot,
        siblingHashes,
    };
}
/**
 * Verify Merkle proof
 */
export function verifyMerkleProof(receiptChecksum, proof) {
    let currentHash = receiptChecksum;
    // Traverse up the Merkle tree
    for (const siblingHash of proof.siblingHashes) {
        // Combine hashes (order matters for Merkle trees)
        const combined = currentHash < siblingHash
            ? currentHash + siblingHash
            : siblingHash + currentHash;
        // Hash combined value
        currentHash = calculateChecksum(Buffer.from(combined));
    }
    // Check if computed root matches
    return currentHash === proof.merkleRoot;
}
/**
 * Anchor receipt to blockchain
 */
export function anchorReceipt(receipt, merkleRoot, blockNumber, blockTimestamp) {
    return {
        ...receipt,
        merkleRoot,
        blockNumber,
        blockTimestamp,
        verified: true,
    };
}
/**
 * Batch receipts for anchoring
 */
export function batchReceiptsForAnchoring(receipts) {
    if (receipts.length === 0) {
        throw new Error('Cannot batch empty receipts');
    }
    // Build Merkle tree from receipt checksums
    const leaves = receipts.map(r => r.checksum);
    const { merkleRoot, proofs } = buildMerkleTree(leaves);
    // Create proofs for each receipt
    const receiptProofs = receipts.map((receipt, index) => createMerkleProof(receipt.receiptId, proofs[index], merkleRoot));
    return {
        merkleRoot,
        proofs: receiptProofs,
    };
}
/**
 * Build Merkle tree from leaves
 * Simple implementation for demonstration
 */
function buildMerkleTree(leaves) {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }
    if (leaves.length === 1) {
        return {
            merkleRoot: leaves[0],
            proofs: [[]],
        };
    }
    // Pad to power of 2
    const paddedLeaves = [...leaves];
    while (!isPowerOfTwo(paddedLeaves.length)) {
        paddedLeaves.push(paddedLeaves[paddedLeaves.length - 1]);
    }
    // Build tree bottom-up
    const tree = [paddedLeaves];
    const proofs = paddedLeaves.map(() => []);
    let currentLevel = paddedLeaves;
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1];
            // Store siblings for proofs
            const leftIndex = tree[0].indexOf(left);
            const rightIndex = tree[0].indexOf(right);
            if (leftIndex !== -1) {
                proofs[leftIndex].push(right);
            }
            if (rightIndex !== -1) {
                proofs[rightIndex].push(left);
            }
            // Combine and hash
            const combined = left + right;
            const hash = calculateChecksum(Buffer.from(combined));
            nextLevel.push(hash);
        }
        tree.push(nextLevel);
        currentLevel = nextLevel;
    }
    return {
        merkleRoot: currentLevel[0],
        proofs: proofs.slice(0, leaves.length), // Remove padding proofs
    };
}
/**
 * Check if number is power of 2
 */
function isPowerOfTwo(n) {
    return n > 0 && (n & (n - 1)) === 0;
}
/**
 * Get receipt summary
 */
export function getReceiptSummary(receipt) {
    return {
        id: receipt.receiptId,
        operation: receipt.operationType,
        amount: receipt.amountPaid,
        network: receipt.networkId,
        timestamp: new Date(receipt.timestamp * 1000).toISOString(),
        verified: receipt.verified,
        anchored: receipt.merkleRoot !== null,
    };
}
/**
 * Filter receipts by time range
 */
export function filterReceiptsByTimeRange(receipts, startTimestamp, endTimestamp) {
    return receipts.filter(r => r.timestamp >= startTimestamp && r.timestamp <= endTimestamp);
}
/**
 * Calculate total amount from receipts
 */
export function calculateTotalAmount(receipts) {
    const total = receipts.reduce((sum, receipt) => sum + parseFloat(receipt.amountPaid), 0);
    return total.toFixed(6);
}
/**
 * Group receipts by network
 */
export function groupReceiptsByNetwork(receipts) {
    const grouped = {};
    for (const receipt of receipts) {
        if (!grouped[receipt.networkId]) {
            grouped[receipt.networkId] = [];
        }
        grouped[receipt.networkId].push(receipt);
    }
    return grouped;
}
/**
 * Group receipts by operation type
 */
export function groupReceiptsByOperation(receipts) {
    const grouped = {};
    for (const receipt of receipts) {
        if (!grouped[receipt.operationType]) {
            grouped[receipt.operationType] = [];
        }
        grouped[receipt.operationType].push(receipt);
    }
    return grouped;
}
//# sourceMappingURL=receipt.js.map
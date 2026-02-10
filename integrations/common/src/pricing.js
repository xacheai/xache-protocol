/**
 * Dynamic pricing engine for Xache Protocol
 * Based on PRD Economic Model and HLD Section 5.2
 */
import { OPERATION_PRICES, CHAIN_PREFERENCES, GAS_SPIKE_THRESHOLD_GWEI, calculatePrice, getRoyaltyRate, } from '@xache/constants';
/**
 * Calculate operation price with reputation adjustment
 */
export function calculateOperationPrice(operation, reputationScore, domainBonus = 0) {
    const basePrice = OPERATION_PRICES[operation];
    const adjustedPrice = calculatePrice(basePrice, reputationScore, domainBonus);
    // Calculate multiplier
    const multiplier = parseFloat(adjustedPrice) / parseFloat(basePrice);
    return {
        basePrice,
        adjustedPrice,
        reputationMultiplier: parseFloat(multiplier.toFixed(2)),
        domainBonus,
    };
}
/**
 * Calculate batch discount
 */
export function calculateBatchDiscount(singlePrice, batchSize) {
    if (batchSize <= 1) {
        return {
            totalPrice: singlePrice,
            perItemPrice: singlePrice,
            discountPercentage: 0,
        };
    }
    // 20% discount for batch operations (hardcoded in OPERATION_PRICES)
    const singlePriceNum = parseFloat(singlePrice);
    const batchPriceNum = singlePriceNum * 0.8; // 20% discount
    const totalPrice = batchPriceNum * batchSize;
    return {
        totalPrice: totalPrice.toFixed(6),
        perItemPrice: batchPriceNum.toFixed(6),
        discountPercentage: 20,
    };
}
/**
 * Calculate royalty payment
 */
export function calculateRoyalty(queryPrice, contributorReputationScore) {
    const price = parseFloat(queryPrice);
    const rate = getRoyaltyRate(contributorReputationScore);
    const royaltyAmount = price * rate;
    const netPrice = price - royaltyAmount;
    return {
        royaltyAmount: royaltyAmount.toFixed(6),
        royaltyRate: rate,
        netPrice: netPrice.toFixed(6),
    };
}
/**
 * Select optimal chain based on transaction amount and gas prices
 */
export function selectOptimalChain(amountUSD, currentGasGwei) {
    const amount = parseFloat(amountUSD);
    // Check for gas spike
    if (currentGasGwei && currentGasGwei > GAS_SPIKE_THRESHOLD_GWEI) {
        return {
            preferredChain: 'solana',
            reason: `Gas spike detected (${currentGasGwei} gwei > ${GAS_SPIKE_THRESHOLD_GWEI} gwei threshold)`,
        };
    }
    // Use chain preferences based on amount
    const baseThreshold = parseFloat(CHAIN_PREFERENCES.BASE_PREFERRED_THRESHOLD);
    if (amount >= baseThreshold) {
        return {
            preferredChain: 'base',
            reason: `Amount $${amountUSD} >= $${baseThreshold} (Base preferred for larger transactions)`,
        };
    }
    return {
        preferredChain: 'solana',
        reason: `Amount $${amountUSD} < $${baseThreshold} (Solana preferred for micro-transactions)`,
    };
}
/**
 * Calculate total cost with gas estimation
 */
export function calculateTotalCost(operationPrice, networkId, gasMultiplier = 1.0) {
    const opCost = parseFloat(operationPrice);
    // Estimate gas cost based on network and multiplier
    let estimatedGas;
    if (networkId === 'base' || networkId === 'base-sepolia') {
        // Base: ~$0.0001 per transaction (estimate)
        estimatedGas = 0.0001 * gasMultiplier * CHAIN_PREFERENCES.BASE_GAS_BUFFER;
    }
    else {
        // Solana: ~$0.00001 per transaction (estimate)
        estimatedGas = 0.00001 * gasMultiplier * CHAIN_PREFERENCES.SOLANA_GAS_BUFFER;
    }
    const totalCost = opCost + estimatedGas;
    return {
        operationCost: opCost.toFixed(6),
        estimatedGasCost: estimatedGas.toFixed(6),
        totalCost: totalCost.toFixed(6),
    };
}
/**
 * Calculate collective query pricing with royalty distribution
 */
export function calculateCollectiveQueryPrice(reputationScore, contributorCount, contributorReputations) {
    // Calculate query price
    const pricing = calculateOperationPrice('COLLECTIVE_QUERY', reputationScore);
    const adjustedPrice = parseFloat(pricing.adjustedPrice);
    // Calculate royalty distribution
    const royaltyDistribution = contributorReputations.map((score, index) => {
        const { royaltyAmount, royaltyRate } = calculateRoyalty(pricing.adjustedPrice, score);
        return {
            contributorIndex: index,
            reputationScore: score,
            royaltyAmount,
            royaltyRate,
        };
    });
    // Calculate total royalties
    const totalRoyalties = royaltyDistribution.reduce((sum, r) => sum + parseFloat(r.royaltyAmount), 0);
    // Protocol revenue is query price minus royalties
    const protocolRevenue = Math.max(0, adjustedPrice - totalRoyalties);
    return {
        basePrice: pricing.basePrice,
        adjustedPrice: pricing.adjustedPrice,
        royaltyDistribution,
        protocolRevenue: protocolRevenue.toFixed(6),
    };
}
/**
 * Calculate storage tier pricing
 * Different pricing for hot/warm/cold tiers
 */
export function calculateStorageTierPrice(tier, basePrice) {
    const base = parseFloat(basePrice);
    // Pricing multipliers by tier
    const multipliers = {
        hot: 1.0, // Standard price
        warm: 0.5, // 50% discount for warm tier
        cold: 0.2, // 80% discount for cold tier
    };
    const multiplier = multipliers[tier];
    const tierPrice = base * multiplier;
    return {
        tierPrice: tierPrice.toFixed(6),
        multiplier,
    };
}
/**
 * Calculate domain bonus (expertise in specific domains)
 */
export function calculateDomainBonus(domainExpertiseScore) {
    // Domain expertise score: 0.0 to 1.0
    // Bonus: 0% to 20%
    return Math.min(domainExpertiseScore * 0.2, 0.2);
}
/**
 * Get pricing summary for display
 */
export function getPricingSummary(operation, reputationScore, options) {
    const pricing = calculateOperationPrice(operation, reputationScore, options?.domainBonus);
    const adjustments = [];
    // Reputation adjustment
    if (pricing.reputationMultiplier !== 1.0) {
        const diff = parseFloat(pricing.adjustedPrice) - parseFloat(pricing.basePrice);
        adjustments.push({
            type: 'reputation',
            description: `Reputation multiplier (${pricing.reputationMultiplier}x)`,
            amount: diff >= 0 ? `+$${diff.toFixed(6)}` : `-$${Math.abs(diff).toFixed(6)}`,
        });
    }
    // Domain bonus
    if (options?.domainBonus) {
        adjustments.push({
            type: 'domain',
            description: 'Domain expertise bonus',
            amount: `+${(options.domainBonus * 100).toFixed(0)}%`,
        });
    }
    // Batch discount
    let finalPrice = pricing.adjustedPrice;
    if (options?.batchSize && options.batchSize > 1) {
        const batch = calculateBatchDiscount(pricing.adjustedPrice, options.batchSize);
        adjustments.push({
            type: 'batch',
            description: `Batch discount (${batch.discountPercentage}%)`,
            amount: `-${((parseFloat(pricing.adjustedPrice) - parseFloat(batch.perItemPrice)) * 100).toFixed(0)}%`,
        });
        finalPrice = batch.totalPrice;
    }
    return {
        operation,
        basePrice: pricing.basePrice,
        adjustments,
        finalPrice,
    };
}
//# sourceMappingURL=pricing.js.map
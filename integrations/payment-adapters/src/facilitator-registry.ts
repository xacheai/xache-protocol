/**
 * Facilitator Registry for x402 v2 Multi-Facilitator Support
 *
 * Manages multiple payment facilitators and provides intelligent selection
 * based on chain, network, preferences, and health status.
 *
 * Per x402 v2 spec: https://www.x402.org/writing/x402-v2-launch
 */

import type {
  FacilitatorConfig,
  FacilitatorPreferences,
  FacilitatorSelection,
  NetworkId,
  PaymentScheme,
} from '@xache/types';

/**
 * Facilitator health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: number;
}

/**
 * Internal facilitator entry with health tracking
 */
interface FacilitatorEntry {
  config: FacilitatorConfig;
  lastHealthCheck?: HealthCheckResult;
}

/**
 * Facilitator Registry
 *
 * Singleton registry for managing payment facilitators.
 * Supports automatic selection based on preferences and health.
 */
export class FacilitatorRegistry {
  private facilitators: Map<string, FacilitatorEntry> = new Map();
  private healthCheckInterval: number = 60000; // 1 minute

  /**
   * Register a new facilitator
   */
  register(config: FacilitatorConfig): void {
    if (this.facilitators.has(config.id)) {
      console.warn(`[FacilitatorRegistry] Overwriting existing facilitator: ${config.id}`);
    }

    this.facilitators.set(config.id, {
      config: { ...config, healthy: true },
    });

    console.log(`[FacilitatorRegistry] Registered facilitator: ${config.id}`, {
      name: config.name,
      chains: config.chains,
      networks: config.networks,
      priority: config.priority,
    });
  }

  /**
   * Unregister a facilitator
   */
  unregister(id: string): boolean {
    const deleted = this.facilitators.delete(id);
    if (deleted) {
      console.log(`[FacilitatorRegistry] Unregistered facilitator: ${id}`);
    }
    return deleted;
  }

  /**
   * Get a facilitator by ID
   */
  get(id: string): FacilitatorConfig | undefined {
    return this.facilitators.get(id)?.config;
  }

  /**
   * List all registered facilitators
   */
  list(): FacilitatorConfig[] {
    return Array.from(this.facilitators.values()).map(entry => entry.config);
  }

  /**
   * Select the best facilitator based on requirements and preferences
   */
  select(options: {
    chain: 'evm' | 'solana';
    network: NetworkId;
    scheme?: PaymentScheme;
    preferences?: FacilitatorPreferences;
  }): FacilitatorSelection | null {
    const { chain, network, scheme = 'exact', preferences } = options;

    // Filter facilitators that support the required chain and network
    let candidates = Array.from(this.facilitators.values())
      .filter(entry => {
        const config = entry.config;

        // Must support the chain
        if (!config.chains.includes(chain)) return false;

        // Must support the network
        if (!config.networks.includes(network)) return false;

        // Must support the scheme (if specified)
        if (scheme && !config.schemes.includes(scheme)) return false;

        // Must be healthy
        if (!config.healthy) return false;

        return true;
      });

    if (candidates.length === 0) {
      console.warn(`[FacilitatorRegistry] No facilitators available for ${chain}/${network}`);
      return null;
    }

    // Apply preferences
    if (preferences) {
      // Filter by avoided networks
      if (preferences.avoidNetworks?.length) {
        candidates = candidates.filter(entry =>
          !preferences.avoidNetworks!.some(n => entry.config.networks.includes(n))
        );
      }

      // Prefer specific facilitators
      if (preferences.preferredFacilitators?.length) {
        const preferred = candidates.filter(entry =>
          preferences.preferredFacilitators!.includes(entry.config.id)
        );
        if (preferred.length > 0) {
          candidates = preferred;
        }
      }

      // Filter by max latency
      if (preferences.maxLatencyMs) {
        const withinLatency = candidates.filter(entry =>
          !entry.config.avgLatencyMs || entry.config.avgLatencyMs <= preferences.maxLatencyMs!
        );
        if (withinLatency.length > 0) {
          candidates = withinLatency;
        }
      }
    }

    // Sort by priority (higher = preferred) and latency (lower = preferred)
    candidates.sort((a, b) => {
      // First by priority (descending)
      if (b.config.priority !== a.config.priority) {
        return b.config.priority - a.config.priority;
      }
      // Then by latency (ascending)
      const aLatency = a.config.avgLatencyMs || Infinity;
      const bLatency = b.config.avgLatencyMs || Infinity;
      return aLatency - bLatency;
    });

    const selected = candidates[0];
    const alternatives = candidates.slice(1).map(e => e.config);

    // Determine selection reason
    let reason: FacilitatorSelection['reason'] = 'priority';
    if (preferences?.preferredFacilitators?.includes(selected.config.id)) {
      reason = 'preference';
    } else if (candidates.length > 1 && selected.config.avgLatencyMs) {
      reason = 'latency';
    } else if (candidates.length === 1) {
      reason = 'fallback';
    }

    console.log(`[FacilitatorRegistry] Selected facilitator: ${selected.config.id}`, {
      reason,
      chain,
      network,
      alternativeCount: alternatives.length,
    });

    return {
      facilitator: selected.config,
      reason,
      alternatives,
    };
  }

  /**
   * Update facilitator health status
   */
  updateHealth(id: string, result: HealthCheckResult): void {
    const entry = this.facilitators.get(id);
    if (!entry) {
      console.warn(`[FacilitatorRegistry] Cannot update health for unknown facilitator: ${id}`);
      return;
    }

    entry.lastHealthCheck = result;
    entry.config.healthy = result.healthy;
    entry.config.lastHealthCheck = result.checkedAt;

    if (result.latencyMs) {
      // Update average latency with exponential moving average
      const alpha = 0.3; // Smoothing factor
      entry.config.avgLatencyMs = entry.config.avgLatencyMs
        ? (alpha * result.latencyMs) + ((1 - alpha) * entry.config.avgLatencyMs)
        : result.latencyMs;
    }

    if (!result.healthy) {
      console.warn(`[FacilitatorRegistry] Facilitator unhealthy: ${id}`, {
        error: result.error,
      });
    }
  }

  /**
   * Clear all facilitators
   */
  clear(): void {
    this.facilitators.clear();
    console.log('[FacilitatorRegistry] Cleared all facilitators');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    byChain: Record<string, number>;
  } {
    const entries = Array.from(this.facilitators.values());
    const byChain: Record<string, number> = {};

    for (const entry of entries) {
      for (const chain of entry.config.chains) {
        byChain[chain] = (byChain[chain] || 0) + 1;
      }
    }

    return {
      total: entries.length,
      healthy: entries.filter(e => e.config.healthy).length,
      unhealthy: entries.filter(e => !e.config.healthy).length,
      byChain,
    };
  }
}

/**
 * Default facilitator registry instance
 */
export const facilitatorRegistry = new FacilitatorRegistry();

/**
 * Register the default CDP facilitator
 */
export function registerDefaultFacilitators(): void {
  // CDP Facilitator (Coinbase Developer Platform)
  facilitatorRegistry.register({
    id: 'cdp',
    name: 'Coinbase Developer Platform',
    chains: ['evm', 'solana'],
    networks: ['base', 'base-sepolia', 'solana', 'solana-devnet'],
    schemes: ['exact'],
    priority: 100, // High priority - default facilitator
    healthy: true,
  });

  console.log('[FacilitatorRegistry] Registered default facilitators');
}

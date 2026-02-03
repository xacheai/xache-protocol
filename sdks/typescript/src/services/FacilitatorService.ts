/**
 * Facilitator Service for x402 v2 Multi-Facilitator Support
 *
 * Manages facilitator preferences and selection for payment processing.
 * Fetches facilitator configuration from the API for network-agnostic operation.
 *
 * Per x402 v2 spec: https://www.x402.org/writing/x402-v2-launch
 */

import type { XacheClient } from '../XacheClient';

/**
 * Network identifier for payment routing
 */
export type NetworkId = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';

/**
 * Supported payment schemes
 */
export type PaymentScheme = 'exact';

/**
 * Facilitator configuration
 */
export interface FacilitatorConfig {
  id: string;
  name: string;
  chains: ('evm' | 'solana')[];
  networks: string[];
  schemes: PaymentScheme[];
  priority: number;
  healthy?: boolean;
  avgLatencyMs?: number;
  lastHealthCheck?: number;
  payTo?: {
    evm?: Record<string, string>;
    solana?: Record<string, string>;
  };
}

/**
 * User preferences for facilitator selection
 */
export interface FacilitatorPreferences {
  /** Preferred facilitator IDs (in order of preference) */
  preferredFacilitators?: string[];
  /** Networks to avoid */
  avoidNetworks?: string[];
  /** Maximum acceptable latency in milliseconds */
  maxLatencyMs?: number;
  /** Preferred chain (evm or solana) */
  preferredChain?: 'evm' | 'solana';
}

/**
 * Facilitator selection result
 */
export interface FacilitatorSelection {
  facilitator: FacilitatorConfig;
  reason: 'preference' | 'priority' | 'latency' | 'fallback';
  alternatives: FacilitatorConfig[];
}

/**
 * API response for facilitator list
 */
interface FacilitatorListResponse {
  facilitators: FacilitatorConfig[];
  defaultNetwork: string;
  environment: 'testnet' | 'mainnet';
}

/**
 * Facilitator Service
 *
 * Provides facilitator management and selection for SDK clients.
 * Fetches configuration from the API for easy mainnet/testnet switching.
 */
export class FacilitatorService {
  private readonly client: XacheClient;
  private preferences: FacilitatorPreferences = {};
  private cachedFacilitators: FacilitatorConfig[] = [];
  private cachedEnvironment: 'testnet' | 'mainnet' = 'testnet';
  private cachedDefaultNetwork: string = 'base-sepolia';
  private lastFetchTime: number = 0;
  private readonly cacheDurationMs = 300000; // 5 minutes

  constructor(client: XacheClient) {
    this.client = client;
  }

  /**
   * Set facilitator preferences for payment routing
   *
   * @example
   * ```typescript
   * client.facilitators.setPreferences({
   *   preferredFacilitators: ['cdp'],
   *   preferredChain: 'solana',
   *   maxLatencyMs: 5000,
   * });
   * ```
   */
  setPreferences(preferences: FacilitatorPreferences): void {
    this.preferences = { ...this.preferences, ...preferences };
  }

  /**
   * Get current facilitator preferences
   */
  getPreferences(): FacilitatorPreferences {
    return { ...this.preferences };
  }

  /**
   * Clear facilitator preferences
   */
  clearPreferences(): void {
    this.preferences = {};
  }

  /**
   * Get the current environment (testnet or mainnet)
   */
  async getEnvironment(): Promise<'testnet' | 'mainnet'> {
    await this.list(); // Ensure cache is populated
    return this.cachedEnvironment;
  }

  /**
   * Get the default network for the current environment
   */
  async getDefaultNetwork(): Promise<string> {
    await this.list(); // Ensure cache is populated
    return this.cachedDefaultNetwork;
  }

  /**
   * List all available facilitators
   * Fetches from API and caches for performance.
   */
  async list(): Promise<FacilitatorConfig[]> {
    // Check cache
    if (this.cachedFacilitators.length > 0 && Date.now() - this.lastFetchTime < this.cacheDurationMs) {
      return this.cachedFacilitators;
    }

    try {
      // Fetch from API (public endpoint, no auth required)
      const response = await this.client.request<FacilitatorListResponse>(
        'GET',
        '/v1/facilitators',
        undefined,
        { skipAuth: true }
      );

      if (response.data) {
        this.cachedFacilitators = response.data.facilitators;
        this.cachedEnvironment = response.data.environment;
        this.cachedDefaultNetwork = response.data.defaultNetwork;
        this.lastFetchTime = Date.now();
        return this.cachedFacilitators;
      }
    } catch (error) {
      console.warn('[FacilitatorService] Failed to fetch facilitators from API, using fallback:', error);
    }

    // Fallback to default if API fails
    if (this.cachedFacilitators.length === 0) {
      this.cachedFacilitators = [this.getDefaultFacilitator()];
      this.lastFetchTime = Date.now();
    }

    return this.cachedFacilitators;
  }

  /**
   * Get the default CDP facilitator configuration (fallback)
   * This is used only if API is unavailable
   */
  private getDefaultFacilitator(): FacilitatorConfig {
    return {
      id: 'cdp',
      name: 'Coinbase Developer Platform',
      chains: ['evm', 'solana'],
      networks: ['base', 'base-sepolia', 'solana', 'solana-devnet'],
      schemes: ['exact'],
      priority: 100,
      healthy: true,
    };
  }

  /**
   * Get a facilitator by ID
   */
  async get(id: string): Promise<FacilitatorConfig | undefined> {
    const facilitators = await this.list();
    return facilitators.find(f => f.id === id);
  }

  /**
   * Select the best facilitator based on requirements and preferences
   *
   * @example
   * ```typescript
   * const selection = await client.facilitators.select({
   *   chain: 'evm',
   *   network: 'base-sepolia',
   * });
   *
   * console.log(`Selected: ${selection.facilitator.name}`);
   * console.log(`Reason: ${selection.reason}`);
   * ```
   */
  async select(options: {
    chain: 'evm' | 'solana';
    network?: string;
    scheme?: PaymentScheme;
  }): Promise<FacilitatorSelection | null> {
    const { chain, scheme = 'exact' } = options;

    // Get network, defaulting based on environment
    let network = options.network;
    if (!network) {
      const defaultNetwork = await this.getDefaultNetwork();
      network = chain === 'solana'
        ? (this.cachedEnvironment === 'mainnet' ? 'solana' : 'solana-devnet')
        : defaultNetwork;
    }

    const facilitators = await this.list();

    // Filter by requirements
    let candidates = facilitators.filter(f => {
      if (!f.chains.includes(chain)) return false;
      if (!f.networks.includes(network!)) return false;
      if (!f.schemes.includes(scheme)) return false;
      if (f.healthy === false) return false;
      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    // Apply preferences
    if (this.preferences.avoidNetworks?.length) {
      candidates = candidates.filter(f =>
        !this.preferences.avoidNetworks!.some(n => f.networks.includes(n))
      );
    }

    if (this.preferences.preferredFacilitators?.length) {
      const preferred = candidates.filter(f =>
        this.preferences.preferredFacilitators!.includes(f.id)
      );
      if (preferred.length > 0) {
        candidates = preferred;
      }
    }

    if (this.preferences.maxLatencyMs) {
      const withinLatency = candidates.filter(f =>
        !f.avgLatencyMs || f.avgLatencyMs <= this.preferences.maxLatencyMs!
      );
      if (withinLatency.length > 0) {
        candidates = withinLatency;
      }
    }

    // Sort by priority (descending) then latency (ascending)
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      const aLatency = a.avgLatencyMs || Infinity;
      const bLatency = b.avgLatencyMs || Infinity;
      return aLatency - bLatency;
    });

    const selected = candidates[0];
    const alternatives = candidates.slice(1);

    // Determine selection reason
    let reason: FacilitatorSelection['reason'] = 'priority';
    if (this.preferences.preferredFacilitators?.includes(selected.id)) {
      reason = 'preference';
    } else if (candidates.length > 1 && selected.avgLatencyMs) {
      reason = 'latency';
    } else if (candidates.length === 1) {
      reason = 'fallback';
    }

    return {
      facilitator: selected,
      reason,
      alternatives,
    };
  }

  /**
   * Check if a specific facilitator supports the given requirements
   */
  async supports(
    facilitatorId: string,
    options: {
      chain: 'evm' | 'solana';
      network: string;
      scheme?: PaymentScheme;
    }
  ): Promise<boolean> {
    const facilitator = await this.get(facilitatorId);
    if (!facilitator) return false;

    const { chain, network, scheme = 'exact' } = options;

    return (
      facilitator.chains.includes(chain) &&
      facilitator.networks.includes(network) &&
      facilitator.schemes.includes(scheme) &&
      facilitator.healthy !== false
    );
  }

  /**
   * Get facilitator selection header for payment requests
   * This can be included in payment requests to hint at facilitator preference
   *
   * @internal
   */
  getSelectionHeader(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.preferences.preferredFacilitators?.length) {
      headers['X-Facilitator-Preference'] = this.preferences.preferredFacilitators.join(',');
    }

    if (this.preferences.preferredChain) {
      headers['X-Preferred-Chain'] = this.preferences.preferredChain;
    }

    return headers;
  }

  /**
   * Clear the facilitator cache to force a refresh
   */
  clearCache(): void {
    this.cachedFacilitators = [];
    this.lastFetchTime = 0;
  }
}

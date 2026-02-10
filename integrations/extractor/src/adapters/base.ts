/**
 * Base adapter interface and utilities
 */

export interface LLMAdapter {
  complete(prompt: string): Promise<string>;
}

/**
 * Base configuration for API-based adapters
 */
export interface APIAdapterConfig {
  /**
   * API key (user-provided, never stored by Xache)
   */
  apiKey: string;

  /**
   * Model name/identifier
   */
  model: string;

  /**
   * Optional base URL override
   */
  baseUrl?: string;

  /**
   * Optional max tokens
   */
  maxTokens?: number;

  /**
   * Optional temperature
   */
  temperature?: number;
}

/**
 * Ollama adapter for local OSS models
 *
 * Enables zero-cost, privacy-first extraction using local models.
 * No API keys needed - runs entirely on user's infrastructure.
 */

import type { LLMAdapter } from './base';

export interface OllamaAdapterConfig {
  /**
   * Ollama model to use
   * @example 'llama3.1:70b', 'llama3.3', 'mistral', 'qwen2.5:72b'
   */
  model: string;

  /**
   * Ollama server base URL
   * @default 'http://localhost:11434'
   */
  baseUrl?: string;

  /**
   * Temperature (0.0-1.0)
   * @default 0.7
   */
  temperature?: number;

  /**
   * Optional system prompt
   */
  system?: string;
}

/**
 * Ollama adapter for local OSS model extraction
 *
 * Benefits:
 * - Zero API costs (runs locally)
 * - Privacy-first (traces never leave your infrastructure)
 * - No API keys needed
 * - Works with any Ollama-compatible model
 *
 * @example
 * ```typescript
 * import { MemoryExtractor, OllamaAdapter } from '@xache/extractor';
 *
 * const extractor = new MemoryExtractor({
 *   llm: new OllamaAdapter({
 *     model: 'llama3.1:70b',
 *     baseUrl: 'http://localhost:11434'
 *   })
 * });
 * ```
 *
 * @see https://ollama.com/ for installation and model list
 */
export class OllamaAdapter implements LLMAdapter {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly temperature: number;
  private readonly system?: string;

  constructor(config: OllamaAdapterConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.temperature = config.temperature ?? 0.7;
    this.system = config.system;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        system: this.system,
        stream: false,
        options: {
          temperature: this.temperature,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();

    // Extract text from response
    if (data.response) {
      return data.response;
    }

    throw new Error('Unexpected Ollama API response format');
  }
}

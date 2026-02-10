/**
 * Anthropic Claude adapter
 *
 * Provides convenience wrapper for Anthropic's API.
 * User provides their own API key - Xache never touches it.
 */

import type { LLMAdapter, APIAdapterConfig } from './base';

export interface AnthropicAdapterConfig {
  /**
   * Anthropic API key (user-provided)
   */
  apiKey: string;

  /**
   * Claude model to use
   * @default 'claude-3-5-sonnet-20241022'
   */
  model?: string;

  /**
   * Maximum tokens for response
   * @default 4096
   */
  maxTokens?: number;

  /**
   * Temperature (0.0-1.0)
   * @default 0.7
   */
  temperature?: number;
}

/**
 * Anthropic Claude adapter for memory extraction
 *
 * @example
 * ```typescript
 * import { MemoryExtractor, AnthropicAdapter } from '@xache/extractor';
 *
 * const extractor = new MemoryExtractor({
 *   llm: new AnthropicAdapter({
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *     model: 'claude-3-5-sonnet-20241022'
 *   })
 * });
 * ```
 */
export class AnthropicAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: AnthropicAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();

    // Extract text from response
    if (data.content && data.content.length > 0 && data.content[0].text) {
      return data.content[0].text;
    }

    throw new Error('Unexpected Anthropic API response format');
  }
}

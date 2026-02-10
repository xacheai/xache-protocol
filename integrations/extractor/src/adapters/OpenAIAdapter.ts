/**
 * OpenAI GPT adapter
 *
 * Provides convenience wrapper for OpenAI's API.
 * User provides their own API key - Xache never touches it.
 */

import type { LLMAdapter } from './base';

export interface OpenAIAdapterConfig {
  /**
   * OpenAI API key (user-provided)
   */
  apiKey: string;

  /**
   * OpenAI model to use
   * @default 'gpt-4-turbo'
   */
  model?: string;

  /**
   * Maximum tokens for response
   * @default 4096
   */
  maxTokens?: number;

  /**
   * Temperature (0.0-2.0)
   * @default 0.7
   */
  temperature?: number;

  /**
   * Optional base URL override (for Azure OpenAI, etc.)
   */
  baseUrl?: string;
}

/**
 * OpenAI GPT adapter for memory extraction
 *
 * @example
 * ```typescript
 * import { MemoryExtractor, OpenAIAdapter } from '@xache/extractor';
 *
 * const extractor = new MemoryExtractor({
 *   llm: new OpenAIAdapter({
 *     apiKey: process.env.OPENAI_API_KEY,
 *     model: 'gpt-4-turbo'
 *   })
 * });
 * ```
 */
export class OpenAIAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly baseUrl: string;

  constructor(config: OpenAIAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gpt-4-turbo';
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
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
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();

    // Extract text from response
    if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
      return data.choices[0].message.content;
    }

    throw new Error('Unexpected OpenAI API response format');
  }
}

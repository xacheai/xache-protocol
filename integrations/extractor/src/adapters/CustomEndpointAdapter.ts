/**
 * Custom Endpoint Adapter
 * Supports Ollama, Replicate, Modal, and custom LLM endpoints
 */

import type { LLMAdapter } from '../types';

export type EndpointFormat = 'openai' | 'anthropic' | 'ollama' | 'replicate' | 'custom';

export interface CustomEndpointConfig {
  url: string;
  authToken?: string;
  format?: EndpointFormat;
  model?: string;
  headers?: Record<string, string>;
}

export class CustomEndpointAdapter implements LLMAdapter {
  constructor(private config: CustomEndpointConfig) {
    if (!config.url) {
      throw new Error('CustomEndpointAdapter requires url');
    }
  }

  async complete(prompt: string): Promise<string> {
    const body = this.formatRequest(prompt);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Custom endpoint error: ${response.status} ${response.statusText}. ${errorText}`
      );
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  private formatRequest(prompt: string): unknown {
    const format = this.config.format || 'custom';

    switch (format) {
      case 'openai':
        return {
          model: this.config.model || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
        };

      case 'anthropic':
        return {
          model: this.config.model || 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        };

      case 'ollama':
        return {
          model: this.config.model || 'llama2',
          prompt: prompt,
          stream: false,
        };

      case 'replicate':
        return {
          version: this.config.model,
          input: { prompt },
        };

      default:
        // Generic custom format
        return { prompt };
    }
  }

  private parseResponse(data: unknown): string {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response from custom endpoint');
    }

    const format = this.config.format || 'custom';
    const response = data as Record<string, unknown>;

    switch (format) {
      case 'openai':
        if (
          Array.isArray(response.choices) &&
          response.choices[0] &&
          typeof response.choices[0] === 'object'
        ) {
          const choice = response.choices[0] as Record<string, unknown>;
          if (choice.message && typeof choice.message === 'object') {
            const message = choice.message as Record<string, unknown>;
            return String(message.content || '');
          }
        }
        throw new Error('Invalid OpenAI response format');

      case 'anthropic':
        if (Array.isArray(response.content) && response.content[0]) {
          const content = response.content[0] as Record<string, unknown>;
          return String(content.text || '');
        }
        throw new Error('Invalid Anthropic response format');

      case 'ollama':
        if (typeof response.response === 'string') {
          return response.response;
        }
        throw new Error('Invalid Ollama response format');

      case 'replicate':
        if (Array.isArray(response.output)) {
          return response.output.join('');
        } else if (typeof response.output === 'string') {
          return response.output;
        }
        throw new Error('Invalid Replicate response format');

      default:
        // Try common response formats
        if (typeof response.response === 'string') {
          return response.response;
        } else if (typeof response.output === 'string') {
          return response.output;
        } else if (typeof response.text === 'string') {
          return response.text;
        } else if (typeof response.content === 'string') {
          return response.content;
        }

        // Last resort: stringify
        return JSON.stringify(data);
    }
  }
}

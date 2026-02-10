/**
 * Pre-built LLM adapters for common providers
 *
 * All adapters use user-provided API keys.
 * Xache never touches or stores API keys.
 */

export { AnthropicAdapter } from './AnthropicAdapter';
export type { AnthropicAdapterConfig } from './AnthropicAdapter';

export { OpenAIAdapter } from './OpenAIAdapter';
export type { OpenAIAdapterConfig } from './OpenAIAdapter';

export { OllamaAdapter } from './OllamaAdapter';
export type { OllamaAdapterConfig } from './OllamaAdapter';

export { CustomEndpointAdapter } from './CustomEndpointAdapter';
export type { CustomEndpointConfig, EndpointFormat } from './CustomEndpointAdapter';

export type { LLMAdapter, APIAdapterConfig } from './base';

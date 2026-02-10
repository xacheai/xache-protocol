/**
 * Client-side PII scrubbing for agent traces
 * Removes sensitive information before sending to extraction services
 */

export interface ScrubOptions {
  removeEmails?: boolean;
  removePhones?: boolean;
  removeIPs?: boolean;
  removeAPIKeys?: boolean;
  removeURLs?: boolean;
  customPatterns?: RegExp[];
}

export interface ScrubResult {
  scrubbedTrace: string;
  removals: {
    emails: number;
    phones: number;
    ips: number;
    apiKeys: number;
    urls: number;
    custom: number;
  };
}

/**
 * Scrub PII from trace before sending to extraction service
 */
export function scrubTrace(
  trace: string,
  options: ScrubOptions = {}
): ScrubResult {
  let scrubbed = trace;
  const removals = {
    emails: 0,
    phones: 0,
    ips: 0,
    apiKeys: 0,
    urls: 0,
    custom: 0,
  };

  // Email addresses
  if (options.removeEmails !== false) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = scrubbed.match(emailRegex);
    removals.emails = matches?.length || 0;
    scrubbed = scrubbed.replace(emailRegex, '[EMAIL_REDACTED]');
  }

  // Phone numbers (US and international formats)
  if (options.removePhones !== false) {
    const phoneRegex = /\b(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g;
    const matches = scrubbed.match(phoneRegex);
    removals.phones = matches?.length || 0;
    scrubbed = scrubbed.replace(phoneRegex, '[PHONE_REDACTED]');
  }

  // IP addresses (IPv4)
  if (options.removeIPs !== false) {
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    const matches = scrubbed.match(ipRegex);
    removals.ips = matches?.length || 0;
    scrubbed = scrubbed.replace(ipRegex, '[IP_REDACTED]');
  }

  // API keys and tokens
  if (options.removeAPIKeys !== false) {
    // OpenAI keys: sk-...
    // Anthropic keys: sk-ant-api03-...
    // Generic bearer tokens
    // Replicate tokens: r8_...
    const apiKeyRegex = /\b(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|pk_[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9_-]{20,}|r8_[a-zA-Z0-9]{20,})\b/gi;
    const matches = scrubbed.match(apiKeyRegex);
    removals.apiKeys = matches?.length || 0;
    scrubbed = scrubbed.replace(apiKeyRegex, '[API_KEY_REDACTED]');
  }

  // URLs (optional, disabled by default as URLs can be useful context)
  if (options.removeURLs === true) {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = scrubbed.match(urlRegex);
    removals.urls = matches?.length || 0;
    scrubbed = scrubbed.replace(urlRegex, '[URL_REDACTED]');
  }

  // Custom user-defined patterns
  if (options.customPatterns && options.customPatterns.length > 0) {
    for (const pattern of options.customPatterns) {
      const matches = scrubbed.match(pattern);
      removals.custom += matches?.length || 0;
      scrubbed = scrubbed.replace(pattern, '[CUSTOM_REDACTED]');
    }
  }

  return { scrubbedTrace: scrubbed, removals };
}

/**
 * Server-side PII detection (defense in depth)
 * Returns array of warning messages if PII is detected
 */
export function detectPII(trace: string): string[] {
  const warnings: string[] = [];

  // Check for email patterns
  if (/@[\w.-]+\.\w{2,}/.test(trace)) {
    warnings.push('Potential email address detected');
  }

  // Check for phone patterns
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(trace)) {
    warnings.push('Potential phone number detected');
  }

  // Check for IP addresses
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(trace)) {
    warnings.push('Potential IP address detected');
  }

  // Check for API keys
  if (/\b(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|pk_[a-zA-Z0-9]{20,}|r8_[a-zA-Z0-9]{20,})\b/i.test(trace)) {
    warnings.push('Potential API key detected');
  }

  return warnings;
}

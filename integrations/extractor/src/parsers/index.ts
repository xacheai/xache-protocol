/**
 * Trace parsers - normalize different trace formats
 */

import type { TraceFormat } from '../types';

/**
 * Detect trace format
 */
export function detectTraceFormat(trace: string | object): TraceFormat {
  if (typeof trace === 'object') {
    return 'json';
  }

  // Try parsing as JSON
  try {
    JSON.parse(trace);
    return 'json';
  } catch {
    return 'string';
  }
}

/**
 * Normalize trace to string format for LLM
 */
export function normalizeTrace(trace: string | object): string {
  if (typeof trace === 'string') {
    return trace;
  }

  // Convert object/JSON to readable string format
  return JSON.stringify(trace, null, 2);
}

/**
 * Parse LLM response into structured extractions
 * Handles various response formats gracefully
 */
export function parseExtractionResponse(response: string): any[] {
  // Try to extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // No JSON array found - return empty
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse extraction response:', error);
    return [];
  }
}

/**
 * Validate extraction object has required fields
 */
export function isValidExtraction(extraction: any): boolean {
  return (
    extraction &&
    typeof extraction === 'object' &&
    typeof extraction.type === 'string' &&
    typeof extraction.confidence === 'number' &&
    extraction.confidence >= 0 &&
    extraction.confidence <= 1 &&
    extraction.data &&
    typeof extraction.data === 'object' &&
    typeof extraction.reasoning === 'string'
  );
}

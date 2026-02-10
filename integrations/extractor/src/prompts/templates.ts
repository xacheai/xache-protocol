/**
 * Prompt templates for memory extraction
 */

/**
 * Main classification and extraction prompt
 */
export const EXTRACTION_PROMPT = `You are a memory extraction specialist analyzing agent execution traces to identify learnings worth remembering.

AGENT EXECUTION TRACE:
{trace}

{agentContext}

YOUR TASK:
Analyze the trace and extract learnings that would help this agent (or similar agents) perform better in future executions.

STANDARD MEMORY TYPES:
1. USER_PREFERENCE (xache.user.preference)
   - User settings, preferences, communication styles
   - Example: "User prefers concise responses", "User timezone is PST"

2. ERROR_FIX (xache.error.fix)
   - Error-to-solution mappings
   - Example: "TypeError: undefined → added null check"

3. SUCCESSFUL_PATTERN (xache.pattern.success)
   - Approaches and patterns that worked well
   - Example: "Exponential backoff improved API reliability"

4. FAILED_APPROACH (xache.pattern.failure)
   - Approaches that didn't work (to avoid repeating)
   - Example: "WHERE clause optimization didn't improve query time"

5. TOOL_CONFIG (xache.tool.config)
   - Tool settings and configurations
   - Example: "WeatherAPI uses metric units, 5s timeout"

6. CONVERSATION_SUMMARY (xache.conversation.summary)
   - Multi-turn conversation summaries
   - Example: "5-turn conversation about restaurant recommendations"

7. DOMAIN_HEURISTIC (xache.domain.heuristic)
   - Domain-specific insights and heuristics
   - Example: "In code reviews, functions >50 lines should be refactored"

8. OPTIMIZATION_INSIGHT (xache.optimization.insight)
   - Performance optimizations and improvements
   - Example: "Adding index on user_id reduced query time 94%"

EXTRACTION GUIDELINES:
- Focus on actionable, reusable learnings
- Be specific and concrete (avoid vague generalizations)
- Include metrics when available
- Assign confidence scores based on evidence strength
- Extract multiple learnings if multiple patterns exist
- Only extract high-value learnings (not trivial facts)

OUTPUT FORMAT:
Return a JSON array of extractions. Each extraction must have:
{
  "type": "xache.context.type",
  "confidence": 0.85,
  "data": { /* structured data matching the memory type */ },
  "reasoning": "Why this is worth remembering",
  "evidence": "Direct quote from trace supporting this"
}

EXAMPLES:

Example 1 - User Preference:
{
  "type": "xache.user.preference",
  "confidence": 0.95,
  "data": {
    "key": "responseStyle",
    "value": "concise",
    "userId": "user_123",
    "timestamp": 1704067200000
  },
  "reasoning": "User explicitly requested short responses",
  "evidence": "User: 'Keep responses short please'"
}

Example 2 - Error Fix:
{
  "type": "xache.error.fix",
  "confidence": 0.88,
  "data": {
    "error": "TypeError: Cannot read property 'amount' of undefined",
    "solution": "Added null check before accessing payment.amount",
    "context": "payment-processing",
    "timestamp": 1704067200000
  },
  "reasoning": "Agent encountered error and successfully resolved it",
  "evidence": "Error: Cannot read property 'amount' → Fixed by adding: if (payment?.amount)"
}

Example 3 - Optimization Insight:
{
  "type": "xache.optimization.insight",
  "confidence": 0.92,
  "data": {
    "operation": "database-query",
    "improvement": "Added index on user_id column",
    "metrics": {
      "before": 2500,
      "after": 150,
      "unit": "ms",
      "improvement": "94%"
    },
    "timestamp": 1704067200000
  },
  "reasoning": "Measurable performance improvement with clear before/after metrics",
  "evidence": "Query took 2500ms → Added index → Now takes 150ms (94% faster)"
}

NOW ANALYZE THE TRACE ABOVE:
Return ONLY valid JSON array. If no learnings found, return empty array: []
`;

/**
 * Generate agent context section for prompt
 */
export function buildAgentContextSection(agentContext?: string): string {
  if (!agentContext) {
    return '';
  }

  return `AGENT CONTEXT:
This agent operates in the "${agentContext}" domain. Consider domain-specific patterns and best practices when extracting learnings.
`;
}

/**
 * Build the full extraction prompt
 */
export function buildExtractionPrompt(trace: string, agentContext?: string): string {
  const contextSection = buildAgentContextSection(agentContext);

  return EXTRACTION_PROMPT.replace('{trace}', trace).replace('{agentContext}', contextSection);
}

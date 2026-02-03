"""
Memory Extraction for OpenClaw
Extract structured learnings from conversation traces using LLM

This module analyzes OpenClaw conversation logs (markdown files) and extracts:
- Domain heuristics (patterns and best practices)
- User preferences
- Error fixes and solutions
- Successful patterns
- Optimization insights

Extracted learnings can be:
1. Stored to Xache with verifiable receipts
2. Contributed to collective intelligence
3. Used to improve future agent performance
"""

import json
import re
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass, field
from enum import Enum


class MemoryType(str, Enum):
    """Standard memory types for extraction"""
    USER_PREFERENCE = "xache.user.preference"
    ERROR_FIX = "xache.error.fix"
    SUCCESSFUL_PATTERN = "xache.pattern.success"
    FAILED_APPROACH = "xache.pattern.failure"
    TOOL_CONFIG = "xache.tool.config"
    CONVERSATION_SUMMARY = "xache.conversation.summary"
    DOMAIN_HEURISTIC = "xache.domain.heuristic"
    OPTIMIZATION_INSIGHT = "xache.optimization.insight"


@dataclass
class ExtractedMemory:
    """A single extracted memory/learning"""
    type: MemoryType
    confidence: float
    data: Dict[str, Any]
    reasoning: str
    evidence: Optional[str] = None
    suggested_method: str = "store"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value if isinstance(self.type, MemoryType) else self.type,
            "confidence": self.confidence,
            "data": self.data,
            "reasoning": self.reasoning,
            "evidence": self.evidence,
            "suggested_method": self.suggested_method,
        }


# Mapping from memory type to suggested storage method
TYPE_TO_METHOD = {
    MemoryType.USER_PREFERENCE: "rememberPreference",
    MemoryType.ERROR_FIX: "rememberFix",
    MemoryType.SUCCESSFUL_PATTERN: "rememberPattern",
    MemoryType.FAILED_APPROACH: "rememberPattern",
    MemoryType.TOOL_CONFIG: "rememberToolConfig",
    MemoryType.CONVERSATION_SUMMARY: "rememberConversation",
    MemoryType.DOMAIN_HEURISTIC: "rememberHeuristic",
    MemoryType.OPTIMIZATION_INSIGHT: "rememberOptimization",
}


EXTRACTION_PROMPT = '''You are a memory extraction specialist analyzing agent execution traces to identify learnings worth remembering.

AGENT EXECUTION TRACE:
{trace}

{agent_context}

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

EXAMPLE OUTPUT:
[
  {
    "type": "xache.domain.heuristic",
    "confidence": 0.88,
    "data": {
      "domain": "api-integration",
      "pattern": "Rate limiting with exponential backoff prevents 429 errors",
      "evidence": "Reduced errors by 95% in testing"
    },
    "reasoning": "Proven pattern with measurable improvement",
    "evidence": "After implementing backoff, 429 errors dropped from 50/hour to 2/hour"
  }
]

NOW ANALYZE THE TRACE ABOVE:
Return ONLY valid JSON array. If no learnings found, return empty array: []
'''


def build_extraction_prompt(trace: str, agent_context: Optional[str] = None) -> str:
    """Build the full extraction prompt"""
    context_section = ""
    if agent_context:
        context_section = f'''AGENT CONTEXT:
This agent operates in the "{agent_context}" domain. Consider domain-specific patterns and best practices when extracting learnings.
'''

    return EXTRACTION_PROMPT.format(trace=trace, agent_context=context_section)


def parse_extraction_response(response: str) -> List[Dict[str, Any]]:
    """Parse LLM response to extract JSON array"""
    # Try to find JSON array in response
    # Handle cases where LLM adds explanation before/after JSON

    # First try direct JSON parse
    try:
        result = json.loads(response.strip())
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Try to find JSON array in response
    json_match = re.search(r'\[[\s\S]*\]', response)
    if json_match:
        try:
            result = json.loads(json_match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # Try to find JSON objects and wrap in array
    objects = []
    for match in re.finditer(r'\{[^{}]*\}', response):
        try:
            obj = json.loads(match.group())
            if 'type' in obj and 'confidence' in obj:
                objects.append(obj)
        except json.JSONDecodeError:
            continue

    return objects


def validate_extraction(raw: Dict[str, Any]) -> bool:
    """Validate a raw extraction has required fields"""
    required = ['type', 'confidence', 'data', 'reasoning']
    return all(key in raw for key in required)


@dataclass
class MemoryExtractor:
    """
    Extract learnings from conversation traces using LLM.

    Example:
        ```python
        from xache_openclaw.extraction import MemoryExtractor

        # Create extractor with your LLM function
        extractor = MemoryExtractor(
            llm=lambda prompt: my_llm.complete(prompt)
        )

        # Extract from conversation
        learnings = extractor.extract(
            trace=conversation_text,
            agent_context="research"
        )

        # Filter high-confidence learnings
        for learning in learnings:
            if learning.confidence > 0.8:
                print(f"Found: {learning.data}")
        ```
    """
    llm: Callable[[str], str]
    debug: bool = False
    confidence_threshold: float = 0.7

    def extract(
        self,
        trace: str,
        agent_context: Optional[str] = None,
        confidence_threshold: Optional[float] = None,
    ) -> List[ExtractedMemory]:
        """
        Extract learnings from a conversation trace.

        Args:
            trace: The conversation text to analyze
            agent_context: Optional domain hint (e.g., 'research', 'coding')
            confidence_threshold: Override default threshold

        Returns:
            List of ExtractedMemory objects
        """
        # Build prompt
        prompt = build_extraction_prompt(trace, agent_context)

        if self.debug:
            print(f"[Extractor] Trace length: {len(trace)}")
            print(f"[Extractor] Context: {agent_context}")

        # Call LLM
        response = self.llm(prompt)

        if self.debug:
            print(f"[Extractor] Response length: {len(response)}")

        # Parse response
        raw_extractions = parse_extraction_response(response)

        if self.debug:
            print(f"[Extractor] Parsed {len(raw_extractions)} extractions")

        # Validate and transform
        threshold = confidence_threshold or self.confidence_threshold
        results = []

        for raw in raw_extractions:
            if not validate_extraction(raw):
                continue

            if raw.get('confidence', 0) < threshold:
                continue

            # Map type string to enum
            type_str = raw['type']
            try:
                mem_type = MemoryType(type_str)
            except ValueError:
                # Unknown type, skip
                continue

            suggested_method = TYPE_TO_METHOD.get(mem_type, "store")

            results.append(ExtractedMemory(
                type=mem_type,
                confidence=raw['confidence'],
                data=raw['data'],
                reasoning=raw['reasoning'],
                evidence=raw.get('evidence'),
                suggested_method=suggested_method,
            ))

        if self.debug:
            print(f"[Extractor] Valid extractions: {len(results)}")

        return results

    def batch_extract(
        self,
        traces: List[Dict[str, Any]],
    ) -> List[List[ExtractedMemory]]:
        """
        Extract from multiple traces.

        Args:
            traces: List of dicts with 'trace' and optional 'agent_context'

        Returns:
            List of extraction results (one per trace)
        """
        results = []
        for item in traces:
            trace = item.get('trace', '')
            context = item.get('agent_context')
            threshold = item.get('confidence_threshold')
            results.append(self.extract(trace, context, threshold))
        return results


def extract_from_openclaw_memory(
    memory_file: str,
    llm: Callable[[str], str],
    agent_context: Optional[str] = None,
    confidence_threshold: float = 0.7,
) -> List[ExtractedMemory]:
    """
    Extract learnings from an OpenClaw memory file.

    OpenClaw stores memories in markdown files like:
    - memory/YYYY-MM-DD.md (daily memories)
    - MEMORY.md (long-term memory)

    Args:
        memory_file: Path to markdown file
        llm: LLM function for extraction
        agent_context: Optional domain hint
        confidence_threshold: Minimum confidence

    Returns:
        List of extracted memories

    Example:
        ```python
        from xache_openclaw.extraction import extract_from_openclaw_memory

        learnings = extract_from_openclaw_memory(
            memory_file="memory/2024-01-15.md",
            llm=lambda p: my_llm.complete(p),
            agent_context="coding-assistant"
        )
        ```
    """
    with open(memory_file, 'r', encoding='utf-8') as f:
        content = f.read()

    extractor = MemoryExtractor(
        llm=llm,
        confidence_threshold=confidence_threshold,
    )

    return extractor.extract(content, agent_context)


def extract_and_contribute(
    trace: str,
    llm: Callable[[str], str],
    agent_context: Optional[str] = None,
    confidence_threshold: float = 0.8,
    auto_contribute: bool = True,
) -> Dict[str, Any]:
    """
    Extract learnings and optionally contribute to collective intelligence.

    This is a convenience function that:
    1. Extracts learnings from a trace
    2. Filters for heuristic-type learnings
    3. Auto-contributes high-confidence heuristics to the collective

    Args:
        trace: Conversation text
        llm: LLM function for extraction
        agent_context: Domain hint
        confidence_threshold: Minimum confidence for contribution
        auto_contribute: Whether to auto-contribute to collective

    Returns:
        Dict with extractions and contribution results

    Example:
        ```python
        from xache_openclaw.extraction import extract_and_contribute
        from xache_openclaw import set_config

        set_config(wallet_address="0x...", private_key="0x...")

        result = extract_and_contribute(
            trace=conversation_text,
            llm=lambda p: my_llm.complete(p),
            agent_context="research",
            auto_contribute=True
        )

        print(f"Extracted: {len(result['extractions'])}")
        print(f"Contributed: {len(result['contributions'])}")
        ```
    """
    from .tools import collective_contribute

    extractor = MemoryExtractor(
        llm=llm,
        confidence_threshold=confidence_threshold,
    )

    extractions = extractor.extract(trace, agent_context)

    result = {
        "extractions": [e.to_dict() for e in extractions],
        "contributions": [],
        "errors": [],
    }

    if not auto_contribute:
        return result

    # Contribute heuristics and patterns to collective
    contributable_types = [
        MemoryType.DOMAIN_HEURISTIC,
        MemoryType.SUCCESSFUL_PATTERN,
        MemoryType.OPTIMIZATION_INSIGHT,
    ]

    for extraction in extractions:
        if extraction.type not in contributable_types:
            continue

        if extraction.confidence < confidence_threshold:
            continue

        try:
            # Build insight from extraction data
            data = extraction.data
            pattern = data.get('pattern') or data.get('improvement') or str(data)
            domain = data.get('domain') or agent_context or 'general'
            evidence = extraction.evidence or data.get('evidence')

            contribution = collective_contribute(
                insight=pattern,
                domain=domain,
                evidence=evidence,
                tags=[extraction.type.value, f"confidence:{extraction.confidence:.2f}"],
            )

            result["contributions"].append({
                "extraction_type": extraction.type.value,
                "heuristic_id": contribution.get("heuristicId"),
                "pattern": pattern,
                "domain": domain,
            })
        except Exception as e:
            result["errors"].append({
                "extraction_type": extraction.type.value,
                "error": str(e),
            })

    return result


@dataclass
class XacheExtractionTool:
    """
    OpenClaw tool for extracting and contributing learnings.

    Example:
        ```python
        tool = XacheExtractionTool(
            llm=lambda p: my_llm.complete(p)
        )
        result = tool.run(
            trace="conversation text...",
            agent_context="research"
        )
        ```
    """
    name: str = "xache_extract_learnings"
    description: str = (
        "Extract valuable learnings from conversations and contribute to collective intelligence. "
        "Use this to analyze completed conversations and share insights with other agents."
    )
    llm: Callable[[str], str] = field(default=None)
    confidence_threshold: float = 0.8
    auto_contribute: bool = True

    def run(
        self,
        trace: str,
        agent_context: Optional[str] = None,
    ) -> str:
        if self.llm is None:
            return "Error: LLM not configured. Pass llm function when creating tool."

        result = extract_and_contribute(
            trace=trace,
            llm=self.llm,
            agent_context=agent_context,
            confidence_threshold=self.confidence_threshold,
            auto_contribute=self.auto_contribute,
        )

        num_extracted = len(result['extractions'])
        num_contributed = len(result['contributions'])

        output = f"Extracted {num_extracted} learnings"

        if num_contributed > 0:
            output += f", contributed {num_contributed} to collective:\n"
            for c in result['contributions']:
                output += f"- [{c['domain']}] {c['pattern'][:100]}...\n"
        else:
            output += " (none met contribution threshold)"

        if result['errors']:
            output += f"\nErrors: {len(result['errors'])}"

        return output

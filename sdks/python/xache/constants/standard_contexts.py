"""
Standard Memory Context Conventions (SDK Layer)

These are SDK conventions, NOT protocol requirements.
The protocol treats context as an opaque string.
Agents can use custom contexts (e.g., 'mycompany.custom.type').
These standard contexts promote interoperability across the ecosystem.
"""


class StandardContexts:
    """Standard context string constants."""
    USER_PREFERENCE = "xache.user.preference"
    ERROR_FIX = "xache.error.fix"
    SUCCESSFUL_PATTERN = "xache.pattern.success"
    FAILED_APPROACH = "xache.pattern.failure"
    TOOL_CONFIG = "xache.tool.config"
    CONVERSATION_SUMMARY = "xache.conversation.summary"
    DOMAIN_HEURISTIC = "xache.domain.heuristic"
    OPTIMIZATION_INSIGHT = "xache.optimization.insight"
    GRAPH_ENTITY = "xache.graph.entity"
    GRAPH_RELATIONSHIP = "xache.graph.relationship"


STANDARD_CONTEXT_VALUES = {
    v for k, v in vars(StandardContexts).items() if not k.startswith("_")
}

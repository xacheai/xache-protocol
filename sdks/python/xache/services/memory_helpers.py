"""
Memory Helpers — High-level convenience methods for common memory operations.

Uses StandardContexts for interoperable memory patterns.
"""

from typing import Any, Dict, List, Optional

from ..constants.standard_contexts import StandardContexts


class MemoryHelpers:
    """
    Convenience methods for common memory store/retrieve patterns.

    Example:
        ```python
        helpers = MemoryHelpers(client)

        # Store a user preference
        key = await helpers.remember_preference(
            "dark_mode", True,
            subject=subject_ctx,
        )

        # Recall all preferences
        prefs = await helpers.recall_preferences(subject=subject_ctx)
        ```
    """

    def __init__(self, client: Any):
        self.client = client

    # ========== Remember (Store) Methods ==========

    async def remember_preference(
        self,
        key: str,
        value: Any,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a user preference (hot storage)."""
        result = await self.client.memory.store(
            data={"key": key, "value": value},
            storage_tier="hot",
            context=StandardContexts.USER_PREFERENCE,
            tags=["preference", key],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_fix(
        self,
        error: str,
        solution: str,
        domain: Optional[str] = None,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store an error-to-solution mapping (warm storage)."""
        data: Dict[str, Any] = {"error": error, "solution": solution}
        if domain:
            data["domain"] = domain
        tags = ["error-fix"]
        if domain:
            tags.append(f"domain:{domain}")

        result = await self.client.memory.store(
            data=data,
            storage_tier="warm",
            context=StandardContexts.ERROR_FIX,
            tags=tags,
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_pattern(
        self,
        pattern: str,
        success: bool,
        domain: Optional[str] = None,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a successful or failed pattern (warm storage)."""
        ctx = StandardContexts.SUCCESSFUL_PATTERN if success else StandardContexts.FAILED_APPROACH
        data: Dict[str, Any] = {"pattern": pattern, "success": success}
        if domain:
            data["domain"] = domain

        result = await self.client.memory.store(
            data=data,
            storage_tier="warm",
            context=ctx,
            tags=["pattern", "success" if success else "failure"],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_conversation(
        self,
        summary: str,
        key_points: Optional[List[str]] = None,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a conversation summary (hot storage)."""
        data: Dict[str, Any] = {"summary": summary}
        if key_points:
            data["keyPoints"] = key_points

        result = await self.client.memory.store(
            data=data,
            storage_tier="hot",
            context=StandardContexts.CONVERSATION_SUMMARY,
            tags=["conversation"],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_tool_config(
        self,
        tool: str,
        config: Dict[str, Any],
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a tool configuration (warm storage)."""
        result = await self.client.memory.store(
            data={"tool": tool, "config": config},
            storage_tier="warm",
            context=StandardContexts.TOOL_CONFIG,
            tags=["tool-config", tool],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_heuristic(
        self,
        insight: str,
        domain: str,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a domain-specific heuristic (cold storage)."""
        result = await self.client.memory.store(
            data={"insight": insight, "domain": domain},
            storage_tier="cold",
            context=StandardContexts.DOMAIN_HEURISTIC,
            tags=["heuristic", f"domain:{domain}"],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    async def remember_optimization(
        self,
        insight: str,
        category: Optional[str] = None,
        subject: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store an optimization insight (warm storage)."""
        data: Dict[str, Any] = {"insight": insight}
        if category:
            data["category"] = category

        result = await self.client.memory.store(
            data=data,
            storage_tier="warm",
            context=StandardContexts.OPTIMIZATION_INSIGHT,
            tags=["optimization"],
            **(self._subject_kwargs(subject)),
        )
        return result.memory_id

    # ========== Recall (Retrieve) Methods ==========

    async def recall_preferences(
        self,
        subject: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Retrieve all user preferences."""
        result = await self.client.memory.list(
            context=StandardContexts.USER_PREFERENCE,
            limit=limit,
            **(self._subject_kwargs(subject)),
        )
        return [{"storage_key": m.storage_key, "tags": m.tags, "metadata": m.metadata}
                for m in result.memories]

    async def recall_fixes(
        self,
        domain: Optional[str] = None,
        subject: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Retrieve error fixes, optionally filtered by domain."""
        result = await self.client.memory.list(
            context=StandardContexts.ERROR_FIX,
            limit=limit,
            **(self._subject_kwargs(subject)),
        )
        memories = result.memories
        if domain:
            memories = [m for m in memories if f"domain:{domain}" in (m.tags or [])]
        return [{"storage_key": m.storage_key, "tags": m.tags, "metadata": m.metadata}
                for m in memories]

    async def recall_patterns(
        self,
        success_only: Optional[bool] = None,
        subject: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Retrieve patterns, optionally filtered by success/failure."""
        if success_only is True:
            ctx = StandardContexts.SUCCESSFUL_PATTERN
        elif success_only is False:
            ctx = StandardContexts.FAILED_APPROACH
        else:
            # Return both — need two calls
            successes = await self.client.memory.list(
                context=StandardContexts.SUCCESSFUL_PATTERN,
                limit=limit,
                **(self._subject_kwargs(subject)),
            )
            failures = await self.client.memory.list(
                context=StandardContexts.FAILED_APPROACH,
                limit=limit,
                **(self._subject_kwargs(subject)),
            )
            all_memories = successes.memories + failures.memories
            return [{"storage_key": m.storage_key, "tags": m.tags, "metadata": m.metadata}
                    for m in all_memories[:limit]]

        result = await self.client.memory.list(
            context=ctx,
            limit=limit,
            **(self._subject_kwargs(subject)),
        )
        return [{"storage_key": m.storage_key, "tags": m.tags, "metadata": m.metadata}
                for m in result.memories]

    # ========== Helpers ==========

    @staticmethod
    def _subject_kwargs(subject: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert subject context dict to store/list kwargs."""
        if not subject:
            return {}
        kwargs: Dict[str, Any] = {}
        if subject.get("subject_id"):
            kwargs["subject_id"] = subject["subject_id"]
        if subject.get("scope"):
            kwargs["scope"] = subject["scope"]
        if subject.get("segment_id"):
            kwargs["segment_id"] = subject["segment_id"]
        if subject.get("tenant_id"):
            kwargs["tenant_id"] = subject["tenant_id"]
        return kwargs

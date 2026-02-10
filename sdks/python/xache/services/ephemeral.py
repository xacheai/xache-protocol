"""
Ephemeral Context Service

Manages ephemeral working memory sessions -- short-lived, slot-based
scratch space that agents can use during a task and optionally promote
to persistent memory.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass, field


@dataclass
class EphemeralSession:
    """Ephemeral working memory session"""
    session_key: str
    agent_did: str
    status: str
    window: int
    max_windows: int
    ttl_seconds: int
    created_at: str
    expires_at: str
    cumulative_cost: float
    active_slots: List[str]
    total_size: int


@dataclass
class PromoteResult:
    """Result of promoting an ephemeral session to persistent memory"""
    memories_created: int
    memory_ids: List[str]
    receipt_id: Optional[str] = None


@dataclass
class AutoProbeConfig:
    """Configuration for auto-probe in ephemeral sessions"""
    enabled: bool = False
    interval_seconds: int = 60   # min 30, max 300
    max_results: int = 5         # max 20
    scope: Optional[Dict[str, Any]] = None  # { subjectId?, scope?, includeGlobal? }


class EphemeralService:
    """
    Ephemeral Context Service

    Provides ephemeral working memory sessions for agents.
    Sessions are short-lived, slot-based scratch spaces that can be
    promoted to persistent memory when the task is complete.

    Example:
        ```python
        # Create ephemeral session
        session = await client.ephemeral.create_session(ttl_seconds=1800)

        # Write to a slot
        await client.ephemeral.write_slot(
            session.session_key, "facts",
            {"userName": "Alice", "preference": "dark mode"},
        )

        # Read from a slot
        facts = await client.ephemeral.read_slot(session.session_key, "facts")

        # Promote to persistent memory
        result = await client.ephemeral.promote_session(session.session_key)
        print(f"Created {result.memories_created} memories")
        ```
    """

    def __init__(self, client: Any) -> None:
        self.client = client
        self._auto_probe_tasks: Dict[str, asyncio.Task] = {}
        self._auto_probe_seen: Dict[str, Set[str]] = {}

    # =========================================================================
    # Session Lifecycle
    # =========================================================================

    async def create_session(
        self,
        ttl_seconds: Optional[int] = None,
        max_windows: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        auto_probe: Optional[AutoProbeConfig] = None,
    ) -> EphemeralSession:
        """
        Create a new ephemeral session (x402 payment).

        Args:
            ttl_seconds: Session time-to-live in seconds (default 3600)
            max_windows: Maximum renewal windows (default 5)
            metadata: Optional metadata to attach
            auto_probe: Optional auto-probe configuration

        Returns:
            Created ephemeral session
        """
        body: Dict[str, Any] = {}
        if ttl_seconds is not None:
            body["ttlSeconds"] = ttl_seconds
        if max_windows is not None:
            body["maxWindows"] = max_windows
        if metadata is not None:
            body["metadata"] = metadata

        response = await self.client.request("POST", "/v1/ephemeral/sessions", body)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to create ephemeral session")
                if response.error
                else "Failed to create ephemeral session"
            )

        session = self._parse_session(response.data)

        # Start auto-probe if configured
        if auto_probe and auto_probe.enabled:
            self._start_auto_probe(session.session_key, auto_probe)

        return session

    async def get_session(self, session_key: str) -> Optional[EphemeralSession]:
        """
        Get an ephemeral session by key.

        Args:
            session_key: The session key

        Returns:
            Ephemeral session or None if not found
        """
        response = await self.client.request(
            "GET", f"/v1/ephemeral/sessions/{session_key}"
        )

        if not response.success:
            if response.error and response.error.get("code") == "NOT_FOUND":
                return None
            raise Exception(
                response.error.get("message", "Failed to get ephemeral session")
                if response.error
                else "Failed to get ephemeral session"
            )

        if not response.data:
            return None

        return self._parse_session(response.data)

    async def renew_session(self, session_key: str) -> EphemeralSession:
        """
        Renew an ephemeral session (extends TTL).

        Args:
            session_key: The session key

        Returns:
            Renewed ephemeral session
        """
        response = await self.client.request(
            "POST", f"/v1/ephemeral/sessions/{session_key}/renew"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to renew ephemeral session")
                if response.error
                else "Failed to renew ephemeral session"
            )

        return self._parse_session(response.data)

    async def promote_session(self, session_key: str) -> PromoteResult:
        """
        Promote an ephemeral session to persistent memory.

        Args:
            session_key: The session key

        Returns:
            Promotion result with created memory IDs
        """
        response = await self.client.request(
            "POST", f"/v1/ephemeral/sessions/{session_key}/promote"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to promote ephemeral session")
                if response.error
                else "Failed to promote ephemeral session"
            )

        data = response.data
        return PromoteResult(
            memories_created=data.get("memoriesCreated", 0),
            memory_ids=data.get("memoryIds", []),
            receipt_id=data.get("receiptId"),
        )

    async def terminate_session(self, session_key: str) -> bool:
        """
        Terminate an ephemeral session.

        Args:
            session_key: The session key

        Returns:
            True if successfully terminated
        """
        self._stop_auto_probe(session_key)

        response = await self.client.request(
            "DELETE", f"/v1/ephemeral/sessions/{session_key}"
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to terminate ephemeral session")
                if response.error
                else "Failed to terminate ephemeral session"
            )

        return True

    # =========================================================================
    # Slot CRUD
    # =========================================================================

    async def write_slot(
        self, session_key: str, slot: str, data: Dict[str, Any]
    ) -> None:
        """
        Write data to a slot.

        Args:
            session_key: The session key
            slot: Slot name (conversation, facts, tasks, cache, scratch, handoff)
            data: Data to write
        """
        response = await self.client.request(
            "PUT",
            f"/v1/ephemeral/sessions/{session_key}/slots/{slot}",
            {"data": data},
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to write ephemeral slot")
                if response.error
                else "Failed to write ephemeral slot"
            )

    async def read_slot(self, session_key: str, slot: str) -> Dict[str, Any]:
        """
        Read data from a slot.

        Args:
            session_key: The session key
            slot: Slot name

        Returns:
            Slot data
        """
        response = await self.client.request(
            "GET", f"/v1/ephemeral/sessions/{session_key}/slots/{slot}"
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to read ephemeral slot")
                if response.error
                else "Failed to read ephemeral slot"
            )

        return response.data or {}

    async def read_all_slots(self, session_key: str) -> Dict[str, Any]:
        """
        Read all slots for a session.

        Args:
            session_key: The session key

        Returns:
            Dict of slot name to slot data
        """
        response = await self.client.request(
            "GET", f"/v1/ephemeral/sessions/{session_key}/slots"
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to read ephemeral slots")
                if response.error
                else "Failed to read ephemeral slots"
            )

        return response.data or {}

    async def clear_slot(self, session_key: str, slot: str) -> None:
        """
        Clear a slot.

        Args:
            session_key: The session key
            slot: Slot name
        """
        response = await self.client.request(
            "DELETE", f"/v1/ephemeral/sessions/{session_key}/slots/{slot}"
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to clear ephemeral slot")
                if response.error
                else "Failed to clear ephemeral slot"
            )

    # =========================================================================
    # Structured View + Export
    # =========================================================================

    async def get_structured(self, session_key: str) -> Dict[str, Any]:
        """
        Get structured view of an ephemeral session.

        Args:
            session_key: The session key

        Returns:
            Structured view with entities, relationships, and summary
        """
        response = await self.client.request(
            "GET", f"/v1/ephemeral/sessions/{session_key}/structured"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get structured view")
                if response.error
                else "Failed to get structured view"
            )

        return response.data

    async def export_session(
        self, session_key: str, format: str = "json"
    ) -> Dict[str, Any]:
        """
        Export an ephemeral session.

        Args:
            session_key: The session key
            format: Export format (json, markdown, audit)

        Returns:
            Exported session data
        """
        response = await self.client.request(
            "GET",
            f"/v1/ephemeral/sessions/{session_key}/export?format={format}",
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to export ephemeral session")
                if response.error
                else "Failed to export ephemeral session"
            )

        return response.data or {}

    # =========================================================================
    # Convenience
    # =========================================================================

    async def list_sessions(
        self,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        List ephemeral sessions.

        Args:
            status: Filter by status
            limit: Max results
            offset: Pagination offset

        Returns:
            Paginated sessions list
        """
        params: List[str] = []
        if status:
            params.append(f"status={status}")
        if limit is not None:
            params.append(f"limit={limit}")
        if offset is not None:
            params.append(f"offset={offset}")

        qs = "&".join(params)
        path = f"/v1/ephemeral/sessions{'?' + qs if qs else ''}"

        response = await self.client.request("GET", path)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to list ephemeral sessions")
                if response.error
                else "Failed to list ephemeral sessions"
            )

        return response.data

    async def get_stats(self) -> Dict[str, Any]:
        """
        Get ephemeral stats.

        Returns:
            Stats with active sessions, total sessions, spend, etc.
        """
        response = await self.client.request("GET", "/v1/ephemeral/stats")

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get ephemeral stats")
                if response.error
                else "Failed to get ephemeral stats"
            )

        return response.data

    # =========================================================================
    # Auto-Probe
    # =========================================================================

    def _start_auto_probe(self, session_key: str, config: AutoProbeConfig) -> None:
        """Start auto-probe background task for a session."""
        interval = max(30, min(300, config.interval_seconds))
        max_results = max(1, min(20, config.max_results))
        self._auto_probe_seen[session_key] = set()

        task = asyncio.create_task(
            self._auto_probe_loop(session_key, interval, max_results, config.scope)
        )
        self._auto_probe_tasks[session_key] = task

    def _stop_auto_probe(self, session_key: str) -> None:
        """Stop auto-probe background task for a session."""
        task = self._auto_probe_tasks.pop(session_key, None)
        if task and not task.done():
            task.cancel()
        self._auto_probe_seen.pop(session_key, None)

    async def _auto_probe_loop(
        self,
        session_key: str,
        interval: int,
        max_results: int,
        scope: Optional[Dict[str, Any]],
    ) -> None:
        """Background loop that periodically probes for relevant memories."""
        try:
            while True:
                await asyncio.sleep(interval)
                try:
                    await self._run_auto_probe(session_key, max_results, scope)
                except Exception:
                    pass  # Best-effort — don't crash the session on probe failure
        except asyncio.CancelledError:
            pass

    async def _run_auto_probe(
        self,
        session_key: str,
        max_results: int,
        scope: Optional[Dict[str, Any]],
    ) -> None:
        """Run a single auto-probe cycle: read slots -> probe -> write cache."""
        # Read conversation + facts slots
        conversation: Dict[str, Any] = {}
        facts: Dict[str, Any] = {}
        try:
            conversation = await self.read_slot(session_key, "conversation")
        except Exception:
            pass
        try:
            facts = await self.read_slot(session_key, "facts")
        except Exception:
            pass

        parts: List[str] = []
        if conversation:
            parts.append(json.dumps(conversation))
        if facts:
            parts.append(json.dumps(facts))

        if not parts:
            return

        query = " ".join(parts)

        # Probe for relevant memories
        probe_kwargs: Dict[str, Any] = {"query": query, "limit": max_results}
        if scope:
            probe_kwargs["scope"] = scope

        probe_result = await self.client.memory.probe(**probe_kwargs)

        if not probe_result.get("matches"):
            return

        # Deduplicate against already-cached memories
        seen = self._auto_probe_seen.get(session_key, set())
        new_matches = [
            m for m in probe_result["matches"] if m.get("storageKey") not in seen
        ]

        if not new_matches:
            return

        for m in new_matches:
            seen.add(m.get("storageKey", ""))

        # Write new matches to cache slot (merge with existing)
        existing_cache: Dict[str, Any] = {}
        try:
            existing_cache = await self.read_slot(session_key, "cache")
        except Exception:
            pass

        cached_memories = existing_cache.get("autoProbeResults", [])
        now = datetime.now(timezone.utc).isoformat()
        updated = cached_memories + [
            {
                "storageKey": m.get("storageKey"),
                "category": m.get("category"),
                "data": m.get("data"),
                "probedAt": now,
            }
            for m in new_matches
        ]

        await self.write_slot(session_key, "cache", {
            **existing_cache,
            "autoProbeResults": updated,
        })

    # =========================================================================
    # Internal
    # =========================================================================

    def _parse_session(self, data: dict) -> EphemeralSession:
        """Parse session data into EphemeralSession object"""
        return EphemeralSession(
            session_key=data.get("sessionKey", ""),
            agent_did=data.get("agentDID", ""),
            status=data.get("status", "active"),
            window=data.get("window", 1),
            max_windows=data.get("maxWindows", 5),
            ttl_seconds=data.get("ttlSeconds", 3600),
            created_at=data.get("createdAt", ""),
            expires_at=data.get("expiresAt", ""),
            cumulative_cost=data.get("cumulativeCost", 0),
            active_slots=data.get("activeSlots", []),
            total_size=data.get("totalSize", 0),
        )

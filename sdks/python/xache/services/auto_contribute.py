"""
AutoContribute Service — Automatically contributes high-confidence
extracted insights to the collective marketplace.
"""

import hashlib
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class AutoContributeConfig:
    """Configuration for auto-contribution."""
    enabled: bool = False
    confidence_threshold: float = 0.85
    min_reputation: float = 30.0
    domains: Optional[List[str]] = None
    exclude_domains: Optional[List[str]] = None
    delay_hours: float = 0.0
    max_per_day: int = 50
    on_contribute: Optional[Callable] = None


@dataclass
class _AutoContributeState:
    """Internal tracking state."""
    contributed_today: int = 0
    day_start: float = 0.0
    seen_hashes: List[str] = field(default_factory=list)
    pending_delayed: List[Dict[str, Any]] = field(default_factory=list)
    agent_reputation: Optional[float] = None


class AutoContributeService:
    """
    Service that evaluates extracted memories and auto-contributes
    high-confidence ones to the collective marketplace.
    """

    def __init__(self, client: Any, config: Optional[AutoContributeConfig] = None):
        self.client = client
        self.config = config or AutoContributeConfig()
        self._state = _AutoContributeState()

    def _reset_daily_counter(self) -> None:
        """Reset daily contribution counter if new day."""
        now = time.time()
        if now - self._state.day_start > 86400:
            self._state.contributed_today = 0
            self._state.day_start = now

    def _hash_insight(self, data: Dict[str, Any]) -> str:
        """Simple hash for deduplication."""
        content = str(sorted(data.items()))
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _is_qualified(
        self,
        extraction: Dict[str, Any],
        reputation: float,
    ) -> bool:
        """Check if an extraction qualifies for auto-contribution."""
        confidence = extraction.get("confidence", 0)
        if confidence < self.config.confidence_threshold:
            return False

        if reputation < self.config.min_reputation:
            return False

        # Domain filtering
        domain = extraction.get("data", {}).get("domain", "")
        if self.config.domains and domain not in self.config.domains:
            return False
        if self.config.exclude_domains and domain in self.config.exclude_domains:
            return False

        return True

    def get_remaining_contributions(self) -> int:
        """Return available contribution quota for today."""
        self._reset_daily_counter()
        return max(0, self.config.max_per_day - self._state.contributed_today)

    async def evaluate(
        self,
        extractions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Evaluate extractions and auto-contribute qualified ones.

        Args:
            extractions: List of extraction results from ExtractionService

        Returns:
            Dict with contributed count and details
        """
        self._reset_daily_counter()

        if not self.config.enabled:
            qualified = [
                e for e in extractions
                if e.get("confidence", 0) >= self.config.confidence_threshold
            ]
            return {
                "contributed": 0,
                "opportunities": len(qualified),
                "message": "Auto-contribute is disabled",
            }

        # Fetch agent reputation once per session
        if self._state.agent_reputation is None:
            try:
                rep = await self.client.reputation.get_reputation()
                self._state.agent_reputation = rep.get("overall", 0) if isinstance(rep, dict) else 0
            except Exception:
                self._state.agent_reputation = 0

        reputation = self._state.agent_reputation or 0
        contributed = []
        delayed = []

        for extraction in extractions:
            if not self._is_qualified(extraction, reputation):
                continue

            if self._state.contributed_today >= self.config.max_per_day:
                break

            # Dedup check
            insight_hash = self._hash_insight(extraction.get("data", {}))
            if insight_hash in self._state.seen_hashes:
                continue
            self._state.seen_hashes.append(insight_hash)

            # Delay check
            if self.config.delay_hours > 0:
                self._state.pending_delayed.append({
                    "extraction": extraction,
                    "ready_at": time.time() + (self.config.delay_hours * 3600),
                })
                delayed.append(extraction)
                continue

            # Contribute immediately
            try:
                data = extraction.get("data", {})
                pattern = data.get("pattern", str(data)[:500])
                if len(pattern) < 10:
                    pattern = str(data)[:500]

                await self.client.collective.contribute(
                    pattern=pattern[:500],
                    pattern_hash=self._hash_insight(data),
                    domain=data.get("domain", "general"),
                    tags=data.get("tags", ["auto-contributed"]),
                    metrics=self._build_metrics(extraction),
                    encrypted_content_ref="",
                )

                self._state.contributed_today += 1
                contributed.append(extraction)

                if self.config.on_contribute:
                    self.config.on_contribute(extraction)
            except Exception:
                pass

        return {
            "contributed": len(contributed),
            "delayed": len(delayed),
            "remaining_today": self.get_remaining_contributions(),
        }

    async def process_delayed(self) -> Dict[str, Any]:
        """
        Process delayed contributions that are now ready.

        Returns:
            Dict with contributed count
        """
        self._reset_daily_counter()
        now = time.time()

        ready = [p for p in self._state.pending_delayed if p["ready_at"] <= now]
        self._state.pending_delayed = [
            p for p in self._state.pending_delayed if p["ready_at"] > now
        ]

        contributed = 0
        for pending in ready:
            if self._state.contributed_today >= self.config.max_per_day:
                break

            extraction = pending["extraction"]
            try:
                data = extraction.get("data", {})
                pattern = data.get("pattern", str(data)[:500])
                if len(pattern) < 10:
                    pattern = str(data)[:500]

                await self.client.collective.contribute(
                    pattern=pattern[:500],
                    pattern_hash=self._hash_insight(data),
                    domain=data.get("domain", "general"),
                    tags=data.get("tags", ["auto-contributed"]),
                    metrics=self._build_metrics(extraction),
                    encrypted_content_ref="",
                )

                self._state.contributed_today += 1
                contributed += 1

                if self.config.on_contribute:
                    self.config.on_contribute(extraction)
            except Exception:
                pass

        return {
            "contributed": contributed,
            "remaining_delayed": len(self._state.pending_delayed),
            "remaining_today": self.get_remaining_contributions(),
        }

    def _build_metrics(self, extraction: Dict[str, Any]) -> Any:
        """Build HeuristicMetrics from extraction data."""
        from ..types import HeuristicMetrics
        return HeuristicMetrics(
            success_rate=extraction.get("confidence", 0.5),
            sample_size=1,
            confidence=extraction.get("confidence", 0.5),
        )

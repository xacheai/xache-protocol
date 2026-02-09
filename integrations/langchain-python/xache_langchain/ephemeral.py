"""
Xache Ephemeral Context for LangChain
Create, manage, and promote short-lived working memory sessions
"""

from typing import Any, Dict, List, Optional
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from xache import XacheClient


# =============================================================================
# Input Schemas
# =============================================================================


class EphemeralCreateSessionInput(BaseModel):
    """Input for ephemeral create session tool"""

    ttl_seconds: int = Field(default=3600, description="Session TTL in seconds (default: 3600)")
    max_windows: int = Field(default=5, description="Maximum renewal windows (default: 5)")


class EphemeralWriteSlotInput(BaseModel):
    """Input for ephemeral write slot tool"""

    session_key: str = Field(description="The ephemeral session key")
    slot: str = Field(
        description="Slot name (conversation, facts, tasks, cache, scratch, handoff)"
    )
    data: Dict[str, Any] = Field(description="Data to write to the slot")


class EphemeralReadSlotInput(BaseModel):
    """Input for ephemeral read slot tool"""

    session_key: str = Field(description="The ephemeral session key")
    slot: str = Field(
        description="Slot name (conversation, facts, tasks, cache, scratch, handoff)"
    )


class EphemeralPromoteInput(BaseModel):
    """Input for ephemeral promote tool"""

    session_key: str = Field(description="The ephemeral session key to promote")


class EphemeralStatusInput(BaseModel):
    """Input for ephemeral status tool"""

    session_key: str = Field(description="The ephemeral session key")


# =============================================================================
# Sync helper
# =============================================================================


def _run_sync(coro: Any) -> Any:
    """Run an async coroutine synchronously (handles nested loops)."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# =============================================================================
# Tools
# =============================================================================


class XacheEphemeralCreateSessionTool(BaseTool):
    """Create a new ephemeral working memory session."""

    name: str = "xache_ephemeral_create_session"
    description: str = (
        "Create a new ephemeral working memory session. "
        "Returns a session key for storing temporary data in slots."
    )
    args_schema: type[BaseModel] = EphemeralCreateSessionInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        import os

        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(self, ttl_seconds: int = 3600, max_windows: int = 5) -> str:
        async def _create() -> Any:
            async with self._client as client:
                return await client.ephemeral.create_session(
                    ttl_seconds=ttl_seconds, max_windows=max_windows,
                )

        session = _run_sync(_create())
        return (
            f"Created ephemeral session.\n"
            f"Session Key: {session.session_key}\n"
            f"Status: {session.status}\n"
            f"TTL: {session.ttl_seconds}s\n"
            f"Expires: {session.expires_at}"
        )

    async def _arun(self, ttl_seconds: int = 3600, max_windows: int = 5) -> str:
        async with self._client as client:
            session = await client.ephemeral.create_session(
                ttl_seconds=ttl_seconds, max_windows=max_windows,
            )
        return (
            f"Created ephemeral session.\n"
            f"Session Key: {session.session_key}\n"
            f"Status: {session.status}\n"
            f"TTL: {session.ttl_seconds}s\n"
            f"Expires: {session.expires_at}"
        )


class XacheEphemeralWriteSlotTool(BaseTool):
    """Write data to an ephemeral session slot."""

    name: str = "xache_ephemeral_write_slot"
    description: str = (
        "Write data to an ephemeral session slot. "
        "Slots: conversation, facts, tasks, cache, scratch, handoff."
    )
    args_schema: type[BaseModel] = EphemeralWriteSlotInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        import os

        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(self, session_key: str, slot: str, data: Dict[str, Any]) -> str:
        async def _write() -> Any:
            async with self._client as client:
                await client.ephemeral.write_slot(session_key, slot, data)

        _run_sync(_write())
        return f'Wrote data to slot "{slot}" in session {session_key[:12]}...'

    async def _arun(self, session_key: str, slot: str, data: Dict[str, Any]) -> str:
        async with self._client as client:
            await client.ephemeral.write_slot(session_key, slot, data)
        return f'Wrote data to slot "{slot}" in session {session_key[:12]}...'


class XacheEphemeralReadSlotTool(BaseTool):
    """Read data from an ephemeral session slot."""

    name: str = "xache_ephemeral_read_slot"
    description: str = (
        "Read data from an ephemeral session slot. "
        "Slots: conversation, facts, tasks, cache, scratch, handoff."
    )
    args_schema: type[BaseModel] = EphemeralReadSlotInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        import os

        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(self, session_key: str, slot: str) -> str:
        import json

        async def _read() -> Any:
            async with self._client as client:
                return await client.ephemeral.read_slot(session_key, slot)

        data = _run_sync(_read())
        return json.dumps(data, indent=2)

    async def _arun(self, session_key: str, slot: str) -> str:
        import json

        async with self._client as client:
            data = await client.ephemeral.read_slot(session_key, slot)
        return json.dumps(data, indent=2)


class XacheEphemeralPromoteTool(BaseTool):
    """Promote an ephemeral session to persistent memory."""

    name: str = "xache_ephemeral_promote"
    description: str = (
        "Promote an ephemeral session to persistent memory. "
        "Extracts valuable data from slots and stores as permanent memories."
    )
    args_schema: type[BaseModel] = EphemeralPromoteInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        import os

        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(self, session_key: str) -> str:
        async def _promote() -> Any:
            async with self._client as client:
                return await client.ephemeral.promote_session(session_key)

        result = _run_sync(_promote())
        output = f"Promoted session {session_key[:12]}...\n"
        output += f"Memories created: {result.memories_created}\n"
        if result.memory_ids:
            output += f"Memory IDs: {', '.join(result.memory_ids)}\n"
        if result.receipt_id:
            output += f"Receipt: {result.receipt_id}"
        return output

    async def _arun(self, session_key: str) -> str:
        async with self._client as client:
            result = await client.ephemeral.promote_session(session_key)
        output = f"Promoted session {session_key[:12]}...\n"
        output += f"Memories created: {result.memories_created}\n"
        if result.memory_ids:
            output += f"Memory IDs: {', '.join(result.memory_ids)}\n"
        if result.receipt_id:
            output += f"Receipt: {result.receipt_id}"
        return output


class XacheEphemeralStatusTool(BaseTool):
    """Get ephemeral session status and details."""

    name: str = "xache_ephemeral_status"
    description: str = (
        "Get the status and details of an ephemeral session. "
        "Shows active slots, size, TTL, and window information."
    )
    args_schema: type[BaseModel] = EphemeralStatusInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        import os

        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(self, session_key: str) -> str:
        async def _status() -> Any:
            async with self._client as client:
                return await client.ephemeral.get_session(session_key)

        session = _run_sync(_status())
        if not session:
            return f"Session {session_key[:12]}... not found."

        slots = ", ".join(session.active_slots) if session.active_slots else "none"
        return (
            f"Session: {session.session_key[:12]}...\n"
            f"Status: {session.status}\n"
            f"Window: {session.window}/{session.max_windows}\n"
            f"TTL: {session.ttl_seconds}s\n"
            f"Expires: {session.expires_at}\n"
            f"Active Slots: {slots}\n"
            f"Total Size: {session.total_size} bytes\n"
            f"Cumulative Cost: ${session.cumulative_cost:.4f}"
        )

    async def _arun(self, session_key: str) -> str:
        async with self._client as client:
            session = await client.ephemeral.get_session(session_key)
        if not session:
            return f"Session {session_key[:12]}... not found."

        slots = ", ".join(session.active_slots) if session.active_slots else "none"
        return (
            f"Session: {session.session_key[:12]}...\n"
            f"Status: {session.status}\n"
            f"Window: {session.window}/{session.max_windows}\n"
            f"TTL: {session.ttl_seconds}s\n"
            f"Expires: {session.expires_at}\n"
            f"Active Slots: {slots}\n"
            f"Total Size: {session.total_size} bytes\n"
            f"Cumulative Cost: ${session.cumulative_cost:.4f}"
        )

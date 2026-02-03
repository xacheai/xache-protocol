"""
Xache Conversation Memory for AutoGen
Persistent storage for conversation history and context
"""

import os
import uuid
from typing import Any, Dict, List, Optional

from xache import XacheClient
from ._async_utils import run_sync


class XacheConversationMemory:
    """
    Persistent conversation memory backed by Xache.

    Stores conversation history with cryptographic receipts for
    verification and persistence across sessions.

    Example:
        ```python
        from xache_autogen import XacheConversationMemory

        memory = XacheConversationMemory(
            wallet_address="0x...",
            private_key="0x...",
            conversation_id="unique-id"
        )

        # Store conversation turn
        memory.add_message("user", "Hello!")
        memory.add_message("assistant", "Hi there!")

        # Retrieve history
        history = memory.get_history()

        # Summarize and store
        memory.store_summary("User greeted, assistant responded.")
        ```
    """

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        conversation_id: Optional[str] = None,
        api_url: Optional[str] = None,
        chain: str = "base",
    ):
        self.wallet_address = wallet_address
        self.api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self.chain = chain
        # Use UUID for collision-resistant conversation ID
        self.conversation_id = conversation_id or f"autogen-{uuid.uuid4()}"

        chain_prefix = "sol" if chain == "solana" else "evm"
        self.did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"

        self._client = XacheClient(
            api_url=self.api_url,
            did=self.did,
            private_key=private_key,
        )

        # Local message buffer
        self._messages: List[Dict[str, str]] = []

    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """
        Add a message to the conversation.

        Args:
            role: Message role (user, assistant, system)
            content: Message content
            metadata: Optional metadata
        """
        import json
        import time

        message = {
            "role": role,
            "content": content,
            "timestamp": time.time(),
        }
        self._messages.append(message)

        # Store to Xache
        async def _store():
            async with self._client as client:
                result = await client.memory.store(
                    content=json.dumps(message),
                    context=f"autogen:conversation:{self.conversation_id}",
                    tags=["autogen", "conversation", role],
                    metadata={
                        "conversationId": self.conversation_id,
                        "role": role,
                        **(metadata or {}),
                    },
                )
                return result

        run_sync(_store())

    def get_history(self, limit: int = 50) -> List[Dict[str, str]]:
        """
        Get conversation history from remote and update local cache.

        Args:
            limit: Maximum messages to retrieve

        Returns:
            List of messages
        """
        import json

        async def _retrieve():
            async with self._client as client:
                result = await client.memory.retrieve(
                    context=f"autogen:conversation:{self.conversation_id}",
                    limit=limit,
                )
                return result

        result = run_sync(_retrieve())

        # Defensive type checking
        memories = result.get("memories", []) if isinstance(result, dict) else []

        messages = []
        for m in memories:
            try:
                msg = json.loads(m.get("content", "{}"))
                messages.append(msg)
            except json.JSONDecodeError:
                pass

        # Sort by timestamp
        messages.sort(key=lambda x: x.get("timestamp", 0))

        # Sync local cache with remote
        self._messages = messages

        return messages

    def refresh(self) -> List[Dict[str, str]]:
        """
        Refresh local cache from remote storage.

        Returns:
            Updated list of messages
        """
        return self.get_history()

    def store_summary(self, summary: str, metadata: Optional[Dict] = None) -> str:
        """
        Store a conversation summary.

        Args:
            summary: Summary text
            metadata: Optional metadata

        Returns:
            Memory ID
        """

        async def _store():
            async with self._client as client:
                result = await client.memory.store(
                    content=summary,
                    context=f"autogen:summary:{self.conversation_id}",
                    tags=["autogen", "summary"],
                    metadata={
                        "conversationId": self.conversation_id,
                        "messageCount": len(self._messages),
                        **(metadata or {}),
                    },
                )
                return result

        result = run_sync(_store())

        return result.get("memoryId", "")

    def search(self, query: str, limit: int = 5) -> List[Dict]:
        """
        Search conversation history.

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            List of matching memories
        """

        async def _search():
            async with self._client as client:
                result = await client.memory.retrieve(
                    query=query,
                    context=f"autogen:conversation:{self.conversation_id}",
                    limit=limit,
                )
                return result

        result = run_sync(_search())

        # Defensive type checking
        if isinstance(result, dict):
            return result.get("memories", [])
        return []

    def clear_local(self):
        """Clear local message buffer (doesn't delete from Xache)"""
        self._messages = []

    @property
    def messages(self) -> List[Dict[str, str]]:
        """Get local message buffer"""
        return self._messages

    def format_for_prompt(self, max_messages: int = 10) -> str:
        """
        Format recent history for inclusion in prompt.

        Args:
            max_messages: Maximum messages to include

        Returns:
            Formatted string
        """
        recent = self._messages[-max_messages:] if self._messages else []

        if not recent:
            return ""

        lines = []
        for msg in recent:
            role = msg.get("role", "unknown").capitalize()
            content = msg.get("content", "")
            lines.append(f"{role}: {content}")

        return "\n".join(lines)

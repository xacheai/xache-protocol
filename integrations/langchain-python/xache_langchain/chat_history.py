"""
Xache Chat Message History for LangChain
Persistent chat history with verifiable receipts
"""

import os
from typing import List, Optional
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.chat_history import BaseChatMessageHistory

from xache import XacheClient
from ._async_utils import run_sync


class XacheChatMessageHistory(BaseChatMessageHistory):
    """
    Chat message history backed by Xache Protocol.

    Stores chat messages with cryptographic receipts and optional
    reputation tracking.

    Example:
        ```python
        from xache_langchain import XacheChatMessageHistory
        from langchain.memory import ConversationBufferMemory

        history = XacheChatMessageHistory(
            wallet_address="0x...",
            private_key="0x...",
            session_id="unique-session-id"
        )

        memory = ConversationBufferMemory(chat_memory=history)
        ```
    """

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        session_id: str,
        api_url: Optional[str] = None,
        chain: str = "base",
    ):
        """
        Initialize Xache chat history.

        Args:
            wallet_address: Wallet address for authentication
            private_key: Private key for signing
            session_id: Unique session identifier
            api_url: Xache API URL
            chain: Blockchain (base, solana)
        """
        self.wallet_address = wallet_address
        self.private_key = private_key
        self.session_id = session_id
        self.api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self.chain = chain

        # Build DID
        chain_prefix = "sol" if chain == "solana" else "evm"
        self.did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"

        self._client = XacheClient(
            api_url=api_url,
            did=self.did,
            private_key=private_key,
        )

    @property
    def messages(self) -> List[BaseMessage]:
        """Retrieve all messages from Xache"""

        async def _get_messages():
            async with self._client as client:
                # Retrieve memories for this session (filtered by context)
                memories = await client.memory.list(
                    limit=1000,
                    context=f"chat:session:{self.session_id}"
                )

                messages = []
                result_memories = memories.get("memories", []) if isinstance(memories, dict) else memories
                for mem in sorted(result_memories, key=lambda x: x.get("created_at", "")):
                    content = mem.get("content", "")
                    metadata = mem.get("metadata", {})
                    role = metadata.get("role", "human")

                    if role == "human":
                        messages.append(HumanMessage(content=content))
                    elif role == "ai":
                        messages.append(AIMessage(content=content))
                    elif role == "system":
                        messages.append(SystemMessage(content=content))

                return messages

        return run_sync(_get_messages())

    def add_message(self, message: BaseMessage) -> None:
        """Add a message to the history"""

        # Determine role from message type
        if isinstance(message, HumanMessage):
            role = "human"
        elif isinstance(message, AIMessage):
            role = "ai"
        elif isinstance(message, SystemMessage):
            role = "system"
        else:
            role = "unknown"

        async def _add():
            async with self._client as client:
                await client.memory.store(
                    content=message.content,
                    context=f"chat:session:{self.session_id}",
                    metadata={
                        "role": role,
                        "session_id": self.session_id,
                        "source": "langchain",
                        "message_type": message.__class__.__name__,
                    }
                )

        run_sync(_add())

    def add_user_message(self, message: str) -> None:
        """Add a user message"""
        self.add_message(HumanMessage(content=message))

    def add_ai_message(self, message: str) -> None:
        """Add an AI message"""
        self.add_message(AIMessage(content=message))

    def clear(self) -> None:
        """Clear message history (soft delete) using bulk deletion"""
        self.bulk_delete()

    def bulk_delete(self, storage_keys: Optional[List[str]] = None) -> dict:
        """
        Delete multiple messages from history.

        Args:
            storage_keys: List of storage keys to delete. If None, deletes all messages
                         in this session.

        Returns:
            dict with 'deleted' count and 'errors' list
        """
        import asyncio

        async def _bulk_delete():
            async with self._client as client:
                # Get storage keys if not provided
                keys_to_delete = storage_keys
                if keys_to_delete is None:
                    result = await client.memory.list(
                        limit=1000,
                        context=f"chat:session:{self.session_id}"
                    )
                    memories = result.get("memories", []) if isinstance(result, dict) else result
                    keys_to_delete = [
                        mem.get("storage_key") for mem in memories
                        if mem.get("storage_key")
                    ]

                if not keys_to_delete:
                    return {"deleted": 0, "errors": []}

                # Delete in parallel using asyncio.gather with return_exceptions
                async def safe_delete(key):
                    try:
                        await client.memory.delete(key)
                        return {"key": key, "success": True}
                    except Exception as e:
                        return {"key": key, "success": False, "error": str(e)}

                results = await asyncio.gather(
                    *[safe_delete(key) for key in keys_to_delete],
                    return_exceptions=True
                )

                deleted = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
                errors = [
                    r for r in results
                    if isinstance(r, dict) and not r.get("success")
                    or isinstance(r, Exception)
                ]

                return {"deleted": deleted, "errors": errors}

        return run_sync(_bulk_delete())

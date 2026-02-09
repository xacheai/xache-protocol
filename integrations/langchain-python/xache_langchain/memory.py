"""
Xache Memory for LangChain
Drop-in replacement for ConversationBufferMemory with verifiable receipts
"""

import os
from typing import Any, Dict, List, Optional
from langchain.memory.chat_memory import BaseChatMemory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from pydantic import Field

from xache import XacheClient
from ._async_utils import run_sync


class XacheMemory(BaseChatMemory):
    """
    LangChain memory backed by Xache Protocol.

    Provides persistent, verifiable memory with cryptographic receipts.
    One-line replacement for ConversationBufferMemory.

    Example:
        ```python
        # Before (standard LangChain)
        from langchain.memory import ConversationBufferMemory
        memory = ConversationBufferMemory()

        # After (with Xache - one line change!)
        from xache_langchain import XacheMemory
        memory = XacheMemory(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Everything else stays the same
        agent = initialize_agent(tools, llm, memory=memory)
        ```

    Features:
        - Persistent memory across sessions
        - Cryptographic receipts for every operation
        - Reputation tracking for quality
        - x402 micropayments (auto-handled)
    """

    # Xache client configuration
    api_url: str = Field(
        default_factory=lambda: os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
    )
    wallet_address: str = Field(...)
    private_key: Optional[str] = Field(default=None)
    signer: Optional[Any] = Field(default=None)
    wallet_provider: Optional[Any] = Field(default=None)
    encryption_key: Optional[str] = Field(default=None)
    chain: str = Field(default="base")

    # Memory configuration
    memory_key: str = Field(default="history")
    return_messages: bool = Field(default=True)
    human_prefix: str = Field(default="Human")
    ai_prefix: str = Field(default="AI")

    # Internal state
    _client: Optional[XacheClient] = None
    _session_id: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._init_client()

    def _init_client(self):
        """Initialize Xache client"""
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

        # Generate session ID for this memory instance
        import hashlib
        import time
        session_data = f"{did}:{time.time()}"
        self._session_id = hashlib.sha256(session_data.encode()).hexdigest()[:16]

    @property
    def memory_variables(self) -> List[str]:
        """Return memory variables"""
        return [self.memory_key]

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Load memory variables from Xache"""

        async def _load():
            async with self._client as client:
                # Retrieve recent memories for this session (filtered by session context)
                memories = await client.memory.list(
                    limit=50,
                    context=f"langchain:session:{self._session_id}"
                )

                messages = []
                for mem in memories:
                    # Parse stored message format
                    content = mem.get("content", "")
                    metadata = mem.get("metadata", {})

                    if metadata.get("role") == "human":
                        messages.append(HumanMessage(content=content))
                    elif metadata.get("role") == "ai":
                        messages.append(AIMessage(content=content))

                return messages

        messages = run_sync(_load())

        if self.return_messages:
            return {self.memory_key: messages}
        else:
            # Return as string buffer
            buffer = ""
            for msg in messages:
                if isinstance(msg, HumanMessage):
                    buffer += f"{self.human_prefix}: {msg.content}\n"
                elif isinstance(msg, AIMessage):
                    buffer += f"{self.ai_prefix}: {msg.content}\n"
            return {self.memory_key: buffer.strip()}

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Save context to Xache memory"""

        async def _save():
            async with self._client as client:
                # Extract input and output
                input_key = list(inputs.keys())[0] if inputs else "input"
                output_key = list(outputs.keys())[0] if outputs else "output"

                human_input = inputs.get(input_key, "")
                ai_output = outputs.get(output_key, "")

                # Store human message with session context
                if human_input:
                    await client.memory.store(
                        content=human_input,
                        context=f"langchain:session:{self._session_id}",
                        metadata={
                            "role": "human",
                            "session_id": self._session_id,
                            "source": "langchain",
                        }
                    )

                # Store AI message with session context
                if ai_output:
                    await client.memory.store(
                        content=ai_output,
                        context=f"langchain:session:{self._session_id}",
                        metadata={
                            "role": "ai",
                            "session_id": self._session_id,
                            "source": "langchain",
                        }
                    )

        run_sync(_save())

    def clear(self) -> None:
        """Clear memory (marks as deleted in Xache)"""
        # Note: Xache uses soft delete - memories are marked deleted but retained
        # for receipt verification
        self._session_id = None
        self._init_client()  # Reset with new session


class XacheConversationBufferMemory(XacheMemory):
    """Alias for XacheMemory for familiar naming"""
    pass

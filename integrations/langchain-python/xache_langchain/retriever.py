"""
Xache Retriever for LangChain
Semantic memory retrieval for RAG pipelines
"""

import os
from typing import List, Optional, Dict, Any
from langchain.schema import BaseRetriever, Document
from langchain.callbacks.manager import CallbackManagerForRetrieverRun
from pydantic import Field

from xache import XacheClient
from ._async_utils import run_sync


class XacheRetriever(BaseRetriever):
    """
    LangChain retriever backed by Xache Protocol.

    Retrieves semantically relevant memories for RAG pipelines.
    Each retrieval is paid via x402 micropayments.

    Example:
        ```python
        from xache_langchain import XacheRetriever
        from langchain.chains import RetrievalQA

        retriever = XacheRetriever(
            wallet_address="0x...",
            private_key="0x...",
            k=5
        )

        qa = RetrievalQA.from_chain_type(
            llm=llm,
            retriever=retriever
        )
        ```

    For collective intelligence retrieval:
        ```python
        retriever = XacheRetriever(
            wallet_address="0x...",
            private_key="0x...",
            collective_id="research-insights",  # Query collective
            k=10
        )
        ```
    """

    # Xache configuration
    api_url: str = Field(
        default_factory=lambda: os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
    )
    wallet_address: str = Field(...)
    private_key: str = Field(...)
    chain: str = Field(default="base")

    # Retrieval configuration
    k: int = Field(default=5, description="Number of documents to retrieve")
    collective_id: Optional[str] = Field(
        default=None,
        description="Collective ID for collective intelligence queries"
    )
    include_metadata: bool = Field(default=True)
    min_relevance: float = Field(
        default=0.0,
        description="Minimum relevance score (0-1)"
    )

    # Internal
    _client: Optional[XacheClient] = None

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
        )

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> List[Document]:
        """Retrieve relevant documents from Xache"""

        async def _retrieve():
            async with self._client as client:
                if self.collective_id:
                    # Query collective intelligence
                    result = await client.collective.query(
                        collective_id=self.collective_id,
                        query=query,
                        limit=self.k
                    )

                    documents = []
                    for item in result.get("results", []):
                        content = item.get("content", "")
                        metadata = {
                            "source": "xache_collective",
                            "collective_id": self.collective_id,
                            "contributor_did": item.get("contributor_did"),
                            "relevance": item.get("relevance", 0),
                            "receipt_id": item.get("receipt_id"),
                        }
                        if self.include_metadata:
                            metadata.update(item.get("metadata", {}))

                        if item.get("relevance", 1) >= self.min_relevance:
                            documents.append(Document(
                                page_content=content,
                                metadata=metadata
                            ))

                    return documents
                else:
                    # Query personal memories
                    result = await client.memory.retrieve(
                        query=query,
                        limit=self.k
                    )

                    documents = []
                    # Fix: Correctly normalize result - API returns {"memories": [...]}
                    memories = result.get("memories", []) if isinstance(result, dict) else []

                    for mem in memories:
                        content = mem.get("content", "")
                        metadata = {
                            "source": "xache_memory",
                            "storage_key": mem.get("storage_key"),
                            "created_at": mem.get("created_at"),
                            "receipt_id": mem.get("receipt_id"),
                        }
                        if self.include_metadata:
                            metadata.update(mem.get("metadata", {}))

                        documents.append(Document(
                            page_content=content,
                            metadata=metadata
                        ))

                    return documents

        return run_sync(_retrieve())

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> List[Document]:
        """Async retrieve relevant documents"""
        async with self._client as client:
            if self.collective_id:
                result = await client.collective.query(
                    collective_id=self.collective_id,
                    query=query,
                    limit=self.k
                )

                documents = []
                for item in result.get("results", []):
                    content = item.get("content", "")
                    metadata = {
                        "source": "xache_collective",
                        "collective_id": self.collective_id,
                        "contributor_did": item.get("contributor_did"),
                        "relevance": item.get("relevance", 0),
                    }
                    if self.include_metadata:
                        metadata.update(item.get("metadata", {}))

                    if item.get("relevance", 1) >= self.min_relevance:
                        documents.append(Document(
                            page_content=content,
                            metadata=metadata
                        ))

                return documents
            else:
                result = await client.memory.retrieve(
                    query=query,
                    limit=self.k
                )

                documents = []
                # Fix: Correctly normalize result - API returns {"memories": [...]}
                memories = result.get("memories", []) if isinstance(result, dict) else []

                for mem in memories:
                    content = mem.get("content", "")
                    metadata = {
                        "source": "xache_memory",
                        "storage_key": mem.get("storage_key"),
                        "created_at": mem.get("created_at"),
                    }
                    if self.include_metadata:
                        metadata.update(mem.get("metadata", {}))

                    documents.append(Document(
                        page_content=content,
                        metadata=metadata
                    ))

                return documents

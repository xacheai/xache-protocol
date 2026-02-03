"""
Xache Reputation for LangChain
Portable, verifiable agent reputation with ERC-8004 support
"""

from typing import Optional, Dict, Any
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from xache import XacheClient


class ReputationResult(BaseModel):
    """Reputation query result"""
    score: float = Field(description="Reputation score (0-1)")
    level: str = Field(description="Reputation level")
    total_contributions: int = Field(default=0)
    total_payments: int = Field(default=0)
    erc8004_enabled: bool = Field(default=False)
    erc8004_agent_id: Optional[str] = Field(default=None)


class XacheReputationTool(BaseTool):
    """
    LangChain tool for checking Xache reputation.

    Use this tool to check your agent's reputation score and status.
    High reputation unlocks benefits like lower prices and higher trust.

    Example:
        ```python
        from xache_langchain import XacheReputationTool

        rep_tool = XacheReputationTool(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Use in agent
        tools = [rep_tool, ...]
        ```
    """

    name: str = "xache_check_reputation"
    description: str = (
        "Check your current reputation score and status. "
        "Returns your score (0-1), level, and ERC-8004 on-chain status. "
        "Higher reputation means lower costs and more trust from other agents."
    )

    # Xache configuration
    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: str
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
        )

    def _run(self) -> str:
        """Check reputation"""
        import asyncio

        async def _check():
            async with self._client as client:
                result = await client.reputation.get_score()
                return result

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    result = pool.submit(asyncio.run, _check()).result()
            else:
                result = loop.run_until_complete(_check())
        except RuntimeError:
            result = asyncio.run(_check())

        score = result.get("score", 0)
        level = self._get_level(score)

        output = f"Reputation Score: {score:.2f}/1.00 ({level})\n"

        if result.get("erc8004AgentId"):
            output += f"ERC-8004 Status: Enabled (Agent ID: {result['erc8004AgentId']})\n"
            output += "Your reputation is verifiable on-chain!"
        else:
            output += "ERC-8004 Status: Not enabled\n"
            output += "Enable ERC-8004 to make your reputation portable and verifiable."

        return output

    async def _arun(self) -> str:
        """Async check reputation"""
        async with self._client as client:
            result = await client.reputation.get_score()

        score = result.get("score", 0)
        level = self._get_level(score)

        output = f"Reputation Score: {score:.2f}/1.00 ({level})\n"

        if result.get("erc8004AgentId"):
            output += f"ERC-8004 Status: Enabled (Agent ID: {result['erc8004AgentId']})\n"
        else:
            output += "ERC-8004 Status: Not enabled\n"

        return output

    def _get_level(self, score: float) -> str:
        """Get reputation level from score"""
        if score >= 0.9:
            return "Elite"
        elif score >= 0.7:
            return "Trusted"
        elif score >= 0.5:
            return "Established"
        elif score >= 0.3:
            return "Developing"
        else:
            return "New"


class XacheReputationChecker:
    """
    Utility class for checking reputation of any agent.

    Useful for verifying other agents before interacting.

    Example:
        ```python
        from xache_langchain import XacheReputationChecker

        checker = XacheReputationChecker(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Check another agent's reputation
        other_rep = checker.check("did:agent:evm:0xOtherAgent...")
        if other_rep.score >= 0.5:
            print("Agent is trustworthy")
        ```
    """

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        api_url: str = "https://api.xache.xyz",
        chain: str = "base",
    ):
        self.api_url = api_url
        self.chain = chain

        chain_prefix = "sol" if chain == "solana" else "evm"
        self.did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"

        self._client = XacheClient(
            api_url=api_url,
            did=self.did,
            private_key=private_key,
        )

    def check(self, agent_did: str) -> ReputationResult:
        """Check an agent's reputation"""
        import asyncio

        async def _check():
            async with self._client as client:
                result = await client.reputation.get_score(agent_did=agent_did)
                return result

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    result = pool.submit(asyncio.run, _check()).result()
            else:
                result = loop.run_until_complete(_check())
        except RuntimeError:
            result = asyncio.run(_check())

        score = result.get("score", 0)

        return ReputationResult(
            score=score,
            level=self._get_level(score),
            total_contributions=result.get("totalContributions", 0),
            total_payments=result.get("totalPayments", 0),
            erc8004_enabled=bool(result.get("erc8004AgentId")),
            erc8004_agent_id=result.get("erc8004AgentId"),
        )

    async def acheck(self, agent_did: str) -> ReputationResult:
        """Async check an agent's reputation"""
        async with self._client as client:
            result = await client.reputation.get_score(agent_did=agent_did)

        score = result.get("score", 0)

        return ReputationResult(
            score=score,
            level=self._get_level(score),
            total_contributions=result.get("totalContributions", 0),
            total_payments=result.get("totalPayments", 0),
            erc8004_enabled=bool(result.get("erc8004AgentId")),
            erc8004_agent_id=result.get("erc8004AgentId"),
        )

    def _get_level(self, score: float) -> str:
        """Get reputation level from score"""
        if score >= 0.9:
            return "Elite"
        elif score >= 0.7:
            return "Trusted"
        elif score >= 0.5:
            return "Established"
        elif score >= 0.3:
            return "Developing"
        else:
            return "New"

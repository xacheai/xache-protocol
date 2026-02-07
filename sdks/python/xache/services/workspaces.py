"""
Workspace Service - Enterprise workspace and fleet management
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from ..types import DID


@dataclass
class Workspace:
    """Workspace configuration"""
    workspace_id: str
    owner_did: DID
    workspace_name: str
    description: Optional[str]
    budget_limit_cents: Optional[int]
    enabled_chains: Optional[List[str]]
    enabled: bool
    created_at: str
    updated_at: str


@dataclass
class WorkspaceMember:
    """Workspace member"""
    workspace_id: str
    agent_did: DID
    role: str  # 'admin' | 'member'
    added_at: str


@dataclass
class AgentBudget:
    """Agent budget within workspace"""
    agent_did: DID
    spent_cents: int
    percentage_of_total: float


@dataclass
class WorkspaceAnalytics:
    """Workspace analytics"""
    workspace_id: str
    total_agents: int
    total_memories: int
    total_spent_usd: str
    total_operations: int
    operations_by_type: Dict[str, int]
    period_start: str
    period_end: str


@dataclass
class WorkspaceBudget:
    """Workspace budget status"""
    workspace_id: str
    budget_limit_cents: int
    total_spent_cents: int
    remaining_cents: int
    percentage_used: float
    agent_budgets: List[AgentBudget]


class WorkspaceService:
    """
    Workspace service for enterprise fleet management

    Manage workspaces with budget controls, agent membership,
    and analytics for enterprise AI deployments.
    """

    def __init__(self, client):
        self.client = client

    async def create(
        self,
        workspace_name: str,
        description: Optional[str] = None,
        budget_limit_cents: Optional[int] = None,
        enabled_chains: Optional[List[str]] = None,
    ) -> Workspace:
        """
        Create a new workspace

        Args:
            workspace_name: Name for the workspace
            description: Optional description
            budget_limit_cents: Optional budget limit in cents
            enabled_chains: Optional list of enabled chains

        Returns:
            Created workspace

        Example:
            ```python
            workspace = await client.workspaces.create(
                workspace_name="Production Agents",
                description="Fleet of production AI agents",
                budget_limit_cents=100000,  # $1000
                enabled_chains=["evm", "solana"]
            )
            print(f"Created: {workspace.workspace_id}")
            ```
        """
        body: Dict[str, Any] = {"workspaceName": workspace_name}
        if description:
            body["description"] = description
        if budget_limit_cents is not None:
            body["budgetLimitCents"] = budget_limit_cents
        if enabled_chains:
            body["enabledChains"] = enabled_chains

        response = await self.client.request("POST", "/v1/workspaces", body)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to create workspace")
                if response.error
                else "Failed to create workspace"
            )

        return self._parse_workspace(response.data.get("workspace", response.data))

    async def list(self) -> Dict:
        """
        List all workspaces owned by the authenticated owner

        Returns:
            Dictionary with workspaces and count

        Example:
            ```python
            result = await client.workspaces.list()
            for ws in result['workspaces']:
                print(f"{ws.workspace_name}: {'active' if ws.enabled else 'disabled'}")
            ```
        """
        response = await self.client.request("GET", "/v1/workspaces")

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to list workspaces")
                if response.error
                else "Failed to list workspaces"
            )

        return {
            "workspaces": [
                self._parse_workspace(w) for w in response.data.get("workspaces", [])
            ],
            "count": response.data.get("count", 0),
        }

    async def get(self, workspace_id: str) -> Workspace:
        """
        Get workspace by ID

        Args:
            workspace_id: Workspace identifier

        Returns:
            Workspace

        Example:
            ```python
            workspace = await client.workspaces.get("ws_abc123")
            print(f"Budget limit: {workspace.budget_limit_cents}")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "GET", f"/v1/workspaces/{quote(workspace_id, safe='')}"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Workspace not found")
                if response.error
                else "Workspace not found"
            )

        return self._parse_workspace(response.data.get("workspace", response.data))

    async def update(
        self,
        workspace_id: str,
        workspace_name: Optional[str] = None,
        description: Optional[str] = None,
        budget_limit_cents: Optional[int] = None,
        enabled_chains: Optional[List[str]] = None,
        enabled: Optional[bool] = None,
    ) -> Workspace:
        """
        Update workspace settings

        Args:
            workspace_id: Workspace identifier
            workspace_name: Optional new name
            description: Optional new description
            budget_limit_cents: Optional new budget limit
            enabled_chains: Optional new enabled chains
            enabled: Optional enable/disable flag

        Returns:
            Updated workspace

        Example:
            ```python
            updated = await client.workspaces.update(
                "ws_abc123",
                budget_limit_cents=200000  # Increase to $2000
            )
            ```
        """
        from urllib.parse import quote

        body: Dict[str, Any] = {}
        if workspace_name is not None:
            body["workspaceName"] = workspace_name
        if description is not None:
            body["description"] = description
        if budget_limit_cents is not None:
            body["budgetLimitCents"] = budget_limit_cents
        if enabled_chains is not None:
            body["enabledChains"] = enabled_chains
        if enabled is not None:
            body["enabled"] = enabled

        response = await self.client.request(
            "PUT", f"/v1/workspaces/{quote(workspace_id, safe='')}", body
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to update workspace")
                if response.error
                else "Failed to update workspace"
            )

        return self._parse_workspace(response.data.get("workspace", response.data))

    async def delete(self, workspace_id: str) -> None:
        """
        Delete (disable) workspace

        Args:
            workspace_id: Workspace identifier

        Example:
            ```python
            await client.workspaces.delete("ws_abc123")
            print("Workspace deleted")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "DELETE", f"/v1/workspaces/{quote(workspace_id, safe='')}"
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to delete workspace")
                if response.error
                else "Failed to delete workspace"
            )

    async def add_agent(
        self, workspace_id: str, agent_did: DID, role: str = "member"
    ) -> WorkspaceMember:
        """
        Add an agent to a workspace

        Args:
            workspace_id: Workspace identifier
            agent_did: Agent DID to add
            role: Role ('admin' or 'member', default: 'member')

        Returns:
            Workspace member

        Example:
            ```python
            member = await client.workspaces.add_agent(
                "ws_abc123",
                "did:agent:evm:0x1234...",
                role="member"
            )
            print(f"Added with role: {member.role}")
            ```
        """
        from urllib.parse import quote

        body = {"agentDID": agent_did, "role": role}

        response = await self.client.request(
            "POST", f"/v1/workspaces/{quote(workspace_id, safe='')}/agents", body
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to add agent")
                if response.error
                else "Failed to add agent"
            )

        data = response.data.get("member", response.data)
        return WorkspaceMember(
            workspace_id=data["workspaceId"],
            agent_did=data["agentDID"],
            role=data["role"],
            added_at=data["addedAt"],
        )

    async def remove_agent(self, workspace_id: str, agent_did: DID) -> None:
        """
        Remove an agent from a workspace

        Args:
            workspace_id: Workspace identifier
            agent_did: Agent DID to remove

        Example:
            ```python
            await client.workspaces.remove_agent("ws_abc123", "did:agent:evm:0x1234...")
            print("Agent removed")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "DELETE",
            f"/v1/workspaces/{quote(workspace_id, safe='')}/agents/{quote(agent_did, safe='')}",
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to remove agent")
                if response.error
                else "Failed to remove agent"
            )

    async def get_analytics(self, workspace_id: str) -> WorkspaceAnalytics:
        """
        Get workspace analytics

        Args:
            workspace_id: Workspace identifier

        Returns:
            Workspace analytics

        Example:
            ```python
            analytics = await client.workspaces.get_analytics("ws_abc123")
            print(f"Total agents: {analytics.total_agents}")
            print(f"Total spent: {analytics.total_spent_usd}")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "GET", f"/v1/workspaces/{quote(workspace_id, safe='')}/analytics"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get analytics")
                if response.error
                else "Failed to get analytics"
            )

        data = response.data.get("analytics", response.data)
        return WorkspaceAnalytics(
            workspace_id=data["workspaceId"],
            total_agents=data["totalAgents"],
            total_memories=data["totalMemories"],
            total_spent_usd=data["totalSpentUSD"],
            total_operations=data["totalOperations"],
            operations_by_type=data.get("operationsByType", {}),
            period_start=data["periodStart"],
            period_end=data["periodEnd"],
        )

    async def get_budget(self, workspace_id: str) -> WorkspaceBudget:
        """
        Get workspace budget aggregation

        Args:
            workspace_id: Workspace identifier

        Returns:
            Workspace budget status

        Example:
            ```python
            budget = await client.workspaces.get_budget("ws_abc123")
            print(f"Limit: ${budget.budget_limit_cents / 100}")
            print(f"Spent: ${budget.total_spent_cents / 100}")
            print(f"Usage: {budget.percentage_used:.1f}%")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "GET", f"/v1/workspaces/{quote(workspace_id, safe='')}/budget"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get budget")
                if response.error
                else "Failed to get budget"
            )

        data = response.data.get("budget", response.data)
        return WorkspaceBudget(
            workspace_id=data["workspaceId"],
            budget_limit_cents=data["budgetLimitCents"],
            total_spent_cents=data["totalSpentCents"],
            remaining_cents=data["remainingCents"],
            percentage_used=data["percentageUsed"],
            agent_budgets=[
                AgentBudget(
                    agent_did=ab["agentDID"],
                    spent_cents=ab["spentCents"],
                    percentage_of_total=ab["percentageOfTotal"],
                )
                for ab in data.get("agentBudgets", [])
            ],
        )

    def _parse_workspace(self, data: dict) -> Workspace:
        """Parse workspace data into Workspace object"""
        return Workspace(
            workspace_id=data["workspaceId"],
            owner_did=data["ownerDID"],
            workspace_name=data["workspaceName"],
            description=data.get("description"),
            budget_limit_cents=data.get("budgetLimitCents"),
            enabled_chains=data.get("enabledChains"),
            enabled=data.get("enabled", True),
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
        )

"""Budget Service - Manage monthly spending budgets with alert support per HLD §2.2 Budget Guardian"""

from typing import List, Callable, Union
from datetime import datetime
from ..types import BudgetStatus, BudgetAlert, BudgetAlertLevel, BudgetAlertHandler


class BudgetService:
    """Budget service for spending management with proactive alerts"""

    def __init__(self, client):
        self.client = client
        self._alert_handlers: List[BudgetAlertHandler] = []
        self._last_alerted_threshold = 0
        self.DEFAULT_THRESHOLDS = [50, 80, 100]  # Per HLD §2.2

    async def get_status(self) -> BudgetStatus:
        """
        Get current budget status and check alert thresholds (free)

        Example:
            ```python
            budget = await client.budget.get_status()
            print(f"Limit: ${budget.limit_cents / 100}")
            print(f"Spent: ${budget.spent_cents / 100}")
            print(f"Usage: {budget.percentage_used:.1f}%")
            ```
        """
        response = await self.client.request("GET", "/v1/budget")

        if not response.success or not response.data:
            raise Exception("Failed to get budget status")

        data = response.data
        status = BudgetStatus(
            limit_cents=data["limitCents"],
            spent_cents=data["spentCents"],
            remaining_cents=data["remainingCents"],
            percentage_used=data["percentageUsed"],
            current_period=data["currentPeriod"],
        )

        # Check for budget alerts per HLD §2.2
        await self._check_and_trigger_alerts(status)

        return status

    async def update_limit(self, limit_cents: int) -> dict:
        """Update monthly budget limit (free)"""
        self._validate_limit(limit_cents)

        response = await self.client.request(
            "PUT",
            "/v1/budget",
            {"limitCents": limit_cents},
        )

        if not response.success or not response.data:
            raise Exception("Failed to update budget limit")

        return response.data

    async def can_afford(self, operation_cost_cents: int) -> bool:
        """Check if operation is within budget"""
        status = await self.get_status()
        return status.remaining_cents >= operation_cost_cents

    def on_alert(self, handler: BudgetAlertHandler):
        """
        Register an alert handler for budget threshold notifications
        Per PRD FR-021: Usage Alerts at 50%, 80%, 100%

        Args:
            handler: Callback function to handle budget alerts

        Example:
            ```python
            def handle_alert(alert: BudgetAlert):
                print(f"Budget Alert: {alert.level.value}")
                print(f"  Message: {alert.message}")
                print(f"  Usage: {alert.percentage_used:.1f}%")
                print(f"  Remaining: ${alert.remaining_cents / 100}")

                if alert.level == BudgetAlertLevel.CRITICAL_100:
                    # Take action - pause operations, notify admin, etc.
                    print("CRITICAL: Budget limit reached!")

            client.budget.on_alert(handle_alert)
            ```
        """
        self._alert_handlers.append(handler)

    async def get_active_alerts(self) -> List[BudgetAlert]:
        """
        Get all currently active budget alerts

        Returns:
            List of active alerts based on current budget status

        Example:
            ```python
            active_alerts = await client.budget.get_active_alerts()
            if active_alerts:
                print(f"{len(active_alerts)} active budget alerts")
                for alert in active_alerts:
                    print(f"- {alert.level.value}: {alert.message}")
            ```
        """
        status = await self.get_status()
        return self._check_thresholds(status)

    async def is_threshold_crossed(self, threshold: float) -> bool:
        """
        Check if a specific threshold has been crossed

        Args:
            threshold: Threshold percentage to check (50, 80, or 100)

        Returns:
            True if threshold has been crossed

        Example:
            ```python
            if await client.budget.is_threshold_crossed(80):
                print("80% budget threshold crossed!")
            ```
        """
        status = await self.get_status()
        return status.percentage_used >= threshold

    def _check_thresholds(self, status: BudgetStatus) -> List[BudgetAlert]:
        """Check budget thresholds and return active alerts"""
        alerts = []

        for threshold in self.DEFAULT_THRESHOLDS:
            if status.percentage_used >= threshold:
                alerts.append(self._create_alert(status, threshold))

        return alerts

    async def _check_and_trigger_alerts(self, status: BudgetStatus):
        """Check thresholds and trigger alert handlers"""
        # Find the highest crossed threshold
        highest_crossed_threshold = 0
        for threshold in self.DEFAULT_THRESHOLDS:
            if status.percentage_used >= threshold:
                highest_crossed_threshold = threshold

        # Only trigger if we've crossed a new threshold
        if highest_crossed_threshold > self._last_alerted_threshold:
            alert = self._create_alert(status, highest_crossed_threshold)

            # Trigger all registered handlers
            for handler in self._alert_handlers:
                try:
                    # Handle both sync and async handlers
                    import inspect
                    if inspect.iscoroutinefunction(handler):
                        await handler(alert)
                    else:
                        handler(alert)
                except Exception as e:
                    # Log error but don't throw - allow other handlers to execute
                    if self.client.debug:
                        print(f"Budget alert handler error: {e}")

            # Update last alerted threshold
            self._last_alerted_threshold = highest_crossed_threshold

    def _create_alert(self, status: BudgetStatus, threshold: float) -> BudgetAlert:
        """Create a budget alert object"""
        if threshold >= 100:
            level = BudgetAlertLevel.CRITICAL_100
            message = "CRITICAL: Monthly budget limit reached (100%). Operations may be throttled."
        elif threshold >= 80:
            level = BudgetAlertLevel.WARN_80
            message = "WARNING: Approaching budget limit (80%). Consider reviewing spending or increasing limit."
        else:
            level = BudgetAlertLevel.WARN_50
            message = "NOTICE: Half of monthly budget consumed (50%). Monitor spending closely."

        return BudgetAlert(
            level=level,
            threshold=threshold,
            percentage_used=status.percentage_used,
            spent_cents=status.spent_cents,
            limit_cents=status.limit_cents,
            remaining_cents=status.remaining_cents,
            message=message,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    def _validate_limit(self, limit_cents: int):
        """Validate budget limit"""
        if not isinstance(limit_cents, int):
            raise ValueError("limit_cents must be an integer")
        if limit_cents < 0:
            raise ValueError("limit_cents must be non-negative")
        if limit_cents > 1000000:
            raise ValueError("limit_cents cannot exceed 1,000,000 ($10,000)")

    # ========== Fleet Budget (Owner Only) ==========

    async def get_fleet_status(self) -> dict:
        """
        Get fleet budget status for authenticated owner.
        Returns aggregated spending across all owned agents.
        Requires owner authentication (did:owner:...)

        Returns:
            Fleet budget status with per-agent breakdown

        Example:
            ```python
            fleet = await client.budget.get_fleet_status()

            print(f"Fleet Cap: ${fleet['fleet_budget_cap_usd']}")
            print(f"Total Spent: ${fleet['total_spent_usd']}")
            print(f"Usage: {fleet['percentage_used']:.1f}%")

            for agent in fleet['agents']:
                print(f"  {agent['name']}: ${agent['spent_cents'] / 100}")
            ```
        """
        response = await self.client.request("GET", "/v1/budget/fleet")

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get fleet budget status")
                if response.error
                else "Failed to get fleet budget status"
            )

        data = response.data
        return {
            "owner_did": data["ownerDID"],
            "fleet_budget_cap_cents": data.get("fleetBudgetCapCents"),
            "fleet_budget_cap_usd": data.get("fleetBudgetCapUSD"),
            "total_spent_cents": data["totalSpentCents"],
            "total_spent_usd": data["totalSpentUSD"],
            "remaining_cents": data.get("remainingCents"),
            "remaining_usd": data.get("remainingUSD"),
            "percentage_used": data.get("percentageUsed"),
            "agent_count": data["agentCount"],
            "total_agent_limits_cents": data["totalAgentLimitsCents"],
            "agents": data.get("agents", []),
        }

    async def update_fleet_cap(self, fleet_cap_cents: int | None) -> dict:
        """
        Update fleet budget cap for authenticated owner.
        Set to None for unlimited.
        Requires owner authentication (did:owner:...)

        Args:
            fleet_cap_cents: Budget cap in cents, or None for unlimited

        Returns:
            Update confirmation

        Example:
            ```python
            # Set fleet cap to $500
            result = await client.budget.update_fleet_cap(50000)

            # Remove fleet cap (unlimited)
            result = await client.budget.update_fleet_cap(None)
            ```
        """
        if fleet_cap_cents is not None:
            if not isinstance(fleet_cap_cents, int) or fleet_cap_cents < 0:
                raise ValueError("fleet_cap_cents must be a positive integer or None")

        response = await self.client.request(
            "PUT", "/v1/budget/fleet", {"fleetCapCents": fleet_cap_cents}
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to update fleet budget cap")
                if response.error
                else "Failed to update fleet budget cap"
            )

        return response.data

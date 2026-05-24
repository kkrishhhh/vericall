"""A2A Event Bus for Vantage AI agent coordination.

This in-process publish/subscribe bus simulates a production-grade A2A
workflow, allowing sub-agents to be decoupled from the orchestrator.

Agents subscribe to event topics and the bus routes events to the
appropriate handler(s) asynchronously.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Coroutine

from .state import AgentState

logger = logging.getLogger("vantage.event_bus")

AgentEventHandler = Callable[[AgentState, dict[str, Any]], Coroutine[Any, Any, AgentState]]


class AgentEventBus:
    """Simple event-driven bus for agent-to-agent (A2A) dispatch."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[AgentEventHandler]] = {}
        self._lock = asyncio.Lock()

    def subscribe(self, event_name: str, handler: AgentEventHandler) -> None:
        """Register a handler for a specific event topic."""
        normalized = event_name.strip()
        self._subscribers.setdefault(normalized, []).append(handler)
        logger.debug("Subscribed handler %s to event %s", handler.__name__, normalized)

    async def publish(
        self,
        event_name: str,
        state: AgentState,
        payload: dict[str, Any],
    ) -> AgentState:
        """Publish an event to all subscribed agent handlers."""
        normalized = event_name.strip()
        handlers = self._subscribers.get(normalized, [])

        if not handlers:
            raise ValueError(f"No handlers subscribed for event '{normalized}'")

        logger.info("Publishing event %s to %d handler(s)", normalized, len(handlers))

        async with self._lock:
            current_state = state
            for handler in handlers:
                logger.debug("Invoking handler %s for event %s", handler.__name__, normalized)
                current_state = await handler(current_state, payload)

        return current_state

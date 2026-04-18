"""OrchestratorAgent — Central multi-agent coordinator using Groq tool-calling.

This is the brain of the agentic loan origination system. It:
1. Receives AgentState + user_action from the FastAPI endpoint
2. Uses Groq llama-3.3-70b-versatile with tool-calling to decide which
   sub-agent to delegate to based on current_phase and user_action
3. Dispatches to the appropriate sub-agent with the current state
4. Evaluates the result and determines next_ui_phase
5. Returns the updated AgentState

Phase transitions:
    interview → kyc → document → decision → complete
                          ↑          |
                          └──────────┘  (retry loop on cross-validation)

Error handling:
- Each tool invocation is wrapped with try/except + audit logging
- Groq rate limits trigger exponential backoff (3 retries)
- All exceptions captured in audit_trail with timestamps

Sub-agents managed:
    InterviewAgent  — Pre-approval, consent, income validation
    KYCAgent        — Aadhaar/PAN, face match, sanctions
    DocumentAgent   — OCR, cross-validation, geo-match, masking
    DecisionAgent   — Bureau, propensity, offer, RAG policy
"""

from __future__ import annotations

import os
import json
import asyncio
import logging
from typing import Any

from agents.state import (
    AgentState,
    Phase,
    UserAction,
    OrchestrateRequest,
    OrchestrateResponse,
)
from agents.interview_agent import run_interview_agent
from agents.kyc_agent import run_kyc_agent
from agents.document_agent import run_document_agent
from agents.decision_agent import run_decision_agent

logger = logging.getLogger("vantage.orchestrator")

# Groq model for orchestrator reasoning and tool-calling
ORCHESTRATOR_MODEL = "llama-3.3-70b-versatile"

# Maximum retries for Groq API rate limits
MAX_GROQ_RETRIES = 3

# ── Tool definitions for Groq tool-calling ───────────────────────
# These describe the sub-agents as tools the orchestrator can "call"

ORCHESTRATOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_interview",
            "description": (
                "Run the InterviewAgent to process customer interview data. "
                "Calculates pre-approval, validates consent (RBI V-CIP requirement), "
                "and checks income consistency. Call this when user_action is "
                "'start_interview' or 'submit_interview'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why this agent is being invoked",
                    }
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_kyc",
            "description": (
                "Run the KYCAgent to verify customer identity documents. "
                "Validates Aadhaar format and Verhoeff checksum, PAN format, "
                "face matching against ID photo, and sanctions list screening. "
                "Call this when user_action is 'submit_kyc'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why this agent is being invoked",
                    }
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_documents",
            "description": (
                "Run the DocumentAgent to OCR documents, cross-validate fields "
                "across Aadhaar/PAN/address proof, geo-tag the customer's location, "
                "and mask Aadhaar numbers for RBI compliance. Has built-in retry "
                "loop: if cross-validation fails, it requests document re-upload "
                "instead of terminating. Call this when user_action is "
                "'submit_documents' or 'reupload_document'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why this agent is being invoked",
                    }
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_decision",
            "description": (
                "Run the DecisionAgent to compute bureau score, propensity, "
                "generate the loan offer, and query the RBI policy RAG for "
                "regulatory justification. Call this when user_action is "
                "'request_decision' and both KYC and documents are verified."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why this agent is being invoked",
                    }
                },
                "required": ["reason"],
            },
        },
    },
]

# System prompt for the orchestrator LLM
_ORCHESTRATOR_SYSTEM_PROMPT = """You are the OrchestratorAgent for Vantage AI, an RBI-compliant loan origination system.

Your role is to coordinate 4 sub-agents based on the current session state and user action:
1. run_interview — for collecting and validating customer interview data
2. run_kyc — for identity verification (Aadhaar, PAN, face match, sanctions)
3. run_documents — for document OCR, cross-validation, and geo-tagging
4. run_decision — for bureau scoring, loan offer generation, and RBI compliance

Current phase flow: interview → kyc → document → decision → complete

Rules:
- Always call exactly ONE tool per turn based on the user_action and current_phase
- If current_phase is 'interview' and action is 'submit_interview', call run_interview
- If current_phase is 'kyc' and action is 'submit_kyc', call run_kyc
- If current_phase is 'document' and action is 'submit_documents' or 'reupload_document', call run_documents
- If current_phase is 'decision' and action is 'request_decision', call run_decision
- If the action is 'start_interview', call run_interview to initialize
- If the action is 'resume', determine the correct agent based on current_phase
- Provide a clear reason for why you're invoking each agent"""


class OrchestratorAgent:
    """Central orchestrator that manages the multi-agent pipeline.

    Uses Groq's tool-calling feature to decide which sub-agent to invoke
    based on the current state and user action. Falls back to deterministic
    routing if LLM is unavailable.
    """

    def __init__(self) -> None:
        self._groq_client = None

    def _get_groq_client(self):
        """Lazy-initialize the Groq client."""
        if self._groq_client is None:
            from groq import Groq
            self._groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        return self._groq_client

    async def orchestrate(self, request: OrchestrateRequest) -> OrchestrateResponse:
        """Main entry point: process a user action and return updated state.

        1. Determines which sub-agent to invoke (via LLM or fallback)
        2. Runs the selected sub-agent
        3. Computes the next UI phase
        4. Returns the updated state
        """
        state = request.state
        action = request.user_action
        payload = request.payload

        state.log_audit(
            agent="OrchestratorAgent",
            action="orchestrate_start",
            result=f"Action={action.value}, Phase={state.current_phase.value}",
            regulatory_tag="VCIP_AUDIT",
        )

        # Determine which agent to run
        agent_name = await self._resolve_agent(state, action)

        state.log_audit(
            agent="OrchestratorAgent",
            action="agent_resolution",
            result=f"Resolved to: {agent_name}",
        )

        # Dispatch to the selected sub-agent
        try:
            state = await self._dispatch(agent_name, state, payload)
        except Exception as e:
            state.log_error(
                "OrchestratorAgent",
                "DISPATCH_FAILURE",
                f"Failed to run {agent_name}: {str(e)}",
                recoverable=True,
            )
            state.log_audit(
                agent="OrchestratorAgent",
                action="dispatch_error",
                result="",
                success=False,
                error=str(e),
            )

        # Compute phase transitions
        next_phase, message, requires_input = self._compute_next_phase(state, action)
        state.current_phase = next_phase
        state.next_ui_phase = next_phase.value

        state.log_audit(
            agent="OrchestratorAgent",
            action="orchestrate_complete",
            result=f"Next phase: {next_phase.value} | {message}",
            regulatory_tag="VCIP_AUDIT",
        )

        return OrchestrateResponse(
            state=state,
            next_ui_phase=next_phase.value,
            message=message,
            requires_user_input=requires_input,
        )

    async def _resolve_agent(self, state: AgentState, action: UserAction) -> str:
        """Use Groq LLM tool-calling to determine which sub-agent to invoke.

        Falls back to deterministic routing if the LLM is unavailable.
        """
        # Try LLM-based resolution with tool-calling
        try:
            agent_name = await self._llm_resolve(state, action)
            if agent_name:
                return agent_name
        except Exception as e:
            logger.warning(f"LLM resolution failed, using fallback: {e}")

        # Deterministic fallback routing
        return self._deterministic_resolve(state, action)

    async def _llm_resolve(self, state: AgentState, action: UserAction) -> str | None:
        """Ask the Groq LLM which tool (sub-agent) to call.

        Uses tool-calling: the LLM responds with a function call specifying
        which sub-agent to invoke and why.
        """
        client = self._get_groq_client()

        user_message = (
            f"Current session state:\n"
            f"- Phase: {state.current_phase.value}\n"
            f"- User action: {action.value}\n"
            f"- KYC status: {state.kyc_status.status}\n"
            f"- Document status: {state.document_results.status}\n"
            f"- Consent recorded: {state.consent_recorded}\n"
            f"- Retry requests: {len(state.retry_requests)}\n"
            f"- Errors: {len(state.errors)}\n\n"
            f"Which agent should handle the user action '{action.value}'?"
        )

        for attempt in range(MAX_GROQ_RETRIES):
            try:
                response = client.chat.completions.create(
                    model=ORCHESTRATOR_MODEL,
                    messages=[
                        {"role": "system", "content": _ORCHESTRATOR_SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    tools=ORCHESTRATOR_TOOLS,
                    tool_choice="auto",
                    temperature=0.1,
                    max_tokens=150,
                )

                # Extract tool call
                msg = response.choices[0].message
                if msg.tool_calls:
                    tool_name = msg.tool_calls[0].function.name
                    tool_args = json.loads(msg.tool_calls[0].function.arguments)
                    logger.info(f"LLM resolved: {tool_name} — {tool_args.get('reason', '')}")

                    # Map tool names to agent names
                    mapping = {
                        "run_interview": "InterviewAgent",
                        "run_kyc": "KYCAgent",
                        "run_documents": "DocumentAgent",
                        "run_decision": "DecisionAgent",
                    }
                    return mapping.get(tool_name)

                return None

            except Exception as e:
                if "rate_limit" in str(e).lower() and attempt < MAX_GROQ_RETRIES - 1:
                    wait = 2 ** attempt
                    logger.warning(f"Groq rate limit, retry {attempt+1}/{MAX_GROQ_RETRIES} in {wait}s")
                    await asyncio.sleep(wait)
                else:
                    raise

        return None

    @staticmethod
    def _deterministic_resolve(state: AgentState, action: UserAction) -> str:
        """Fallback: deterministic routing based on phase and action.

        Used when the LLM is unavailable (rate limits, API errors, etc.)
        """
        action_map: dict[UserAction, str] = {
            UserAction.START_INTERVIEW: "InterviewAgent",
            UserAction.SUBMIT_INTERVIEW: "InterviewAgent",
            UserAction.SUBMIT_KYC: "KYCAgent",
            UserAction.SUBMIT_DOCUMENTS: "DocumentAgent",
            UserAction.REUPLOAD_DOCUMENT: "DocumentAgent",
            UserAction.REQUEST_DECISION: "DecisionAgent",
        }

        if action in action_map:
            return action_map[action]

        # Resume action: route based on current phase
        if action == UserAction.RESUME:
            phase_map = {
                Phase.INTERVIEW: "InterviewAgent",
                Phase.KYC: "KYCAgent",
                Phase.DOCUMENT: "DocumentAgent",
                Phase.DOCUMENT_REUPLOAD: "DocumentAgent",
                Phase.DECISION: "DecisionAgent",
            }
            return phase_map.get(state.current_phase, "InterviewAgent")

        return "InterviewAgent"

    @staticmethod
    async def _dispatch(
        agent_name: str,
        state: AgentState,
        payload: dict[str, Any],
    ) -> AgentState:
        """Dispatch to the resolved sub-agent."""
        if agent_name == "InterviewAgent":
            return await run_interview_agent(state, payload)
        elif agent_name == "KYCAgent":
            return await run_kyc_agent(state, payload)
        elif agent_name == "DocumentAgent":
            return await run_document_agent(state, payload)
        elif agent_name == "DecisionAgent":
            return await run_decision_agent(state, payload)
        else:
            state.log_error(
                "OrchestratorAgent",
                "UNKNOWN_AGENT",
                f"No handler for agent: {agent_name}",
                recoverable=False,
            )
            return state

    @staticmethod
    def _compute_next_phase(
        state: AgentState,
        action: UserAction,
    ) -> tuple[Phase, str, bool]:
        """Determine the next UI phase based on agent execution results.

        Returns (phase, message, requires_user_input)
        """
        # Check for document retry loop
        if state.document_results.status == "REUPLOAD_REQUIRED":
            retry_msgs = [r.reason for r in state.retry_requests[-3:]]
            return (
                Phase.DOCUMENT_REUPLOAD,
                f"Please re-upload the following document(s): {'; '.join(retry_msgs)}",
                True,
            )

        # Check for manual review escalation
        if state.document_results.status == "MANUAL_REVIEW":
            return (
                Phase.MANUAL_REVIEW,
                "Document verification requires manual review. An officer will contact you.",
                False,
            )

        # Normal phase progression
        if action in (UserAction.START_INTERVIEW, UserAction.SUBMIT_INTERVIEW):
            if not state.consent_recorded:
                return (
                    Phase.INTERVIEW,
                    "Consent not yet recorded — please provide verbal consent to proceed.",
                    True,
                )
            return (
                Phase.KYC,
                f"Interview complete. Pre-approved up to ₹{state.customer_profile.eligible_amount:,.0f}. "
                f"Please submit your KYC documents.",
                True,
            )

        elif action == UserAction.SUBMIT_KYC:
            if state.kyc_status.status == "VERIFIED":
                return (
                    Phase.DOCUMENT,
                    "KYC verified successfully. Please upload your identity documents for cross-validation.",
                    True,
                )
            return (
                Phase.KYC,
                f"KYC verification failed: {state.kyc_status.risk_flag}. Please check your details.",
                True,
            )

        elif action in (UserAction.SUBMIT_DOCUMENTS, UserAction.REUPLOAD_DOCUMENT):
            if state.document_results.status == "VERIFIED":
                return (
                    Phase.DECISION,
                    "Documents verified. Processing your loan decision...",
                    False,  # Auto-advance to decision
                )
            elif state.document_results.status == "FAILED":
                return (
                    Phase.DOCUMENT,
                    "Document verification failed. Please re-submit clear images.",
                    True,
                )
            return (
                Phase.DOCUMENT,
                "Document processing in progress.",
                True,
            )

        elif action == UserAction.REQUEST_DECISION:
            offer = state.offer
            if offer.status == "PRE-APPROVED":
                return (
                    Phase.COMPLETE,
                    f"Congratulations! Your loan of ₹{offer.approved_amount:,.0f} at "
                    f"{offer.interest_rate}% has been pre-approved. EMI: ₹{offer.monthly_emi:,.0f}/month.",
                    False,
                )
            elif offer.status == "NEEDS_REVIEW":
                return (
                    Phase.COMPLETE,
                    "Your application needs additional review. We'll contact you within 24 hours.",
                    False,
                )
            elif offer.status == "DECLINED":
                decline_reasons = "; ".join(offer.decision_reasons[:3]) if offer.decision_reasons else "Policy criteria not met"
                return (
                    Phase.COMPLETE,
                    f"We're unable to proceed with your application at this time. Reason: {decline_reasons}",
                    False,
                )
            return (
                Phase.DECISION,
                "Decision processing...",
                False,
            )

        # Default
        return (state.current_phase, "Processing...", True)

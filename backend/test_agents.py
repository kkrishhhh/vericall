"""Quick verification script for the multi-agent orchestration layer."""

import sys
import os
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

import asyncio
import json

def test_rag():
    print("=" * 60)
    print("TEST: PolicyRAGAgent")
    print("=" * 60)
    from agents.rag_agent import PolicyRAGAgent
    rag = PolicyRAGAgent.get_instance()
    results = rag.query("Aadhaar verification KYC requirements", top_k=2)
    print(f"  Results: {len(results)} citations")
    for i, r in enumerate(results):
        score = r.get("relevance_score", 0)
        text = r.get("text", "")[:150]
        print(f"  [{i}] score={score:.3f} | {text}...")
    print()

def test_orchestrator_import():
    print("=" * 60)
    print("TEST: OrchestratorAgent import")
    print("=" * 60)
    from agents.orchestrator import OrchestratorAgent
    orch = OrchestratorAgent()
    print(f"  OrchestratorAgent created: {type(orch).__name__}")
    print()

async def test_full_interview():
    print("=" * 60)
    print("TEST: Full Interview Flow")
    print("=" * 60)
    from agents.state import AgentState, OrchestrateRequest, UserAction
    from agents.orchestrator import OrchestratorAgent

    orch = OrchestratorAgent()

    # Step 1: Submit interview data
    req = OrchestrateRequest(
        user_action=UserAction.SUBMIT_INTERVIEW,
        payload={
            "name": "Rahul Sharma",
            "employment_type": "salaried",
            "monthly_income": 75000,
            "loan_type": "personal",
            "requested_loan_amount": 500000,
            "declared_age": 32,
            "consent_text": "Yes, I provide my consent for this video recording.",
        }
    )

    result = await orch.orchestrate(req)
    s = result.state
    print(f"  Session: {s.session_id[:8]}...")
    print(f"  Phase: {result.next_ui_phase}")
    print(f"  Message: {result.message}")
    print(f"  Eligible Amount: INR {s.customer_profile.eligible_amount:,.0f}")
    print(f"  Consent: {s.consent_recorded}")
    print(f"  Audit entries: {len(s.audit_trail)}")
    for entry in s.audit_trail:
        print(f"    [{entry.agent}] {entry.action}: {entry.result[:80]}")
    print()

async def test_full_kyc():
    print("=" * 60)
    print("TEST: KYC Flow (with pre-set state)")
    print("=" * 60)
    from agents.state import AgentState, Phase, OrchestrateRequest, UserAction
    from agents.orchestrator import OrchestratorAgent

    orch = OrchestratorAgent()

    # Pre-set state as if interview is done
    state = AgentState()
    state.current_phase = Phase.KYC
    state.consent_recorded = True
    state.customer_profile.name = "Rahul Sharma"
    state.customer_profile.consent = True

    req = OrchestrateRequest(
        state=state,
        user_action=UserAction.SUBMIT_KYC,
        payload={
            "aadhaar_number": "234567890123",
            "pan_number": "ABCDE1234F",
            "selfie_image": "a" * 200,  # Simulated base64
        }
    )

    result = await orch.orchestrate(req)
    s = result.state
    print(f"  KYC Status: {s.kyc_status.status}")
    print(f"  Aadhaar Valid: {s.kyc_status.aadhaar_valid}")
    print(f"  PAN Valid: {s.kyc_status.pan_valid}")
    print(f"  Sanctions Clear: {s.kyc_status.sanctions_clear}")
    print(f"  Next Phase: {result.next_ui_phase}")
    print(f"  Audit entries: {len(s.audit_trail)}")
    print()


if __name__ == "__main__":
    test_rag()
    test_orchestrator_import()
    asyncio.run(test_full_interview())
    asyncio.run(test_full_kyc())
    print("ALL TESTS PASSED")

"""VeriCall Multi-Agent Orchestration Layer.

This package implements a production-grade agentic loan origination system
compliant with RBI KYC Master Direction 2016 and V-CIP requirements.

Architecture:
    OrchestratorAgent (Groq llama-3.3-70b-versatile)
    ├── InterviewAgent    — Pre-approval, consent, income validation
    ├── KYCAgent          — Aadhaar/PAN verification, face match, sanctions
    ├── DocumentAgent     — OCR, cross-validation, geo-match, masking
    ├── DecisionAgent     — Bureau, propensity, offer, RAG policy citation
    └── PolicyRAGAgent    — ChromaDB + MiniLM-L6-v2 for RBI compliance
"""

from agents.state import (
    AgentState,
    OrchestrateRequest,
    OrchestrateResponse,
    AuditEntry,
)
from agents.orchestrator import OrchestratorAgent

__all__ = [
    "AgentState",
    "OrchestrateRequest",
    "OrchestrateResponse",
    "AuditEntry",
    "OrchestratorAgent",
]

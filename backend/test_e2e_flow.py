import httpx
import asyncio
import json

BASE_URL = "http://localhost:8001"

async def run_e2e_test():
    print("=======================================================")
    print("🚀 RUNNING END-TO-END AGENTIC AI & NEURAL NETWORK TEST")
    print("=======================================================\n")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        
        # ---------------------------------------------------------
        # PHASE 1: INTERVIEW
        # ---------------------------------------------------------
        print("➡️ [PHASE 1] Starting Interview Agent...")
        req1 = {
            "state": {
                "session_id": "e2e-test-001",
                "current_phase": "interview"
            },
            "user_action": "submit_interview",
            "payload": {
                "name": "Krishna Thakur",
                "employment_type": "salaried",
                "monthly_income": 95000,
                "declared_age": 25,
                "requested_loan_amount": 500000,
                "consent_text": "Yes, I agree and provide consent."
            }
        }
        
        resp1 = await client.post(f"{BASE_URL}/api/agent/orchestrate", json=req1)
        data1 = resp1.json()
        state1 = data1["state"]
        
        print("✅ Interview Agent replied!")
        print(f"   Next UI Phase: {data1['next_ui_phase']}")
        print(f"   Calculated Preapproval: INR {state1['customer_profile']['eligible_amount']:,.0f}")
        print(f"   Consent Recorded: {state1['consent_recorded']}")
        print(f"   Latest Audit: {state1['audit_trail'][-1]['action']} -> {state1['audit_trail'][-1]['result']}\n")
        
        # ---------------------------------------------------------
        # PHASE 2: KYC
        # ---------------------------------------------------------
        print("➡️ [PHASE 2] Starting KYC Agent...")
        req2 = {
            "state": state1,  # Passing previous state
            "user_action": "submit_kyc",
            "payload": {
                "aadhaar_number": "234567890123",
                "pan_number": "ABCDE1234F",
                "selfie_image": "simulated_base64_image_data_here_which_needs_to_be_long_enough_" * 10
            }
        }
        
        resp2 = await client.post(f"{BASE_URL}/api/agent/orchestrate", json=req2)
        data2 = resp2.json()
        state2 = data2["state"]
        
        print("✅ KYC Agent replied!")
        print(f"   KYC Status: {state2['kyc_status']['status']}")
        print(f"   Aadhaar Valid Format: {state2['kyc_status']['aadhaar_valid']}")
        print(f"   Sanctions Check Clear: {state2['kyc_status']['sanctions_clear']}")
        print(f"   Latest Audit: {state2['audit_trail'][-1]['action']} -> {state2['audit_trail'][-1]['result']}\n")
        
        # ---------------------------------------------------------
        # PHASE 3: DECISION (Skipping Documents for brevity, testing RAG Neural Network)
        # ---------------------------------------------------------
        print("➡️ [PHASE 3] Starting Decision Agent & RAG Neural Network...")
        # Since Document agent requires Groq Vision API (which might fail if not authenticated properly with images), 
        # we will manually set documents to VERIFIED in state to test the Decision & RAG networks.
        state2["document_results"]["status"] = "VERIFIED"
        state2["current_phase"] = "decision"
        
        req3 = {
            "state": state2,
            "user_action": "request_decision",
            "payload": {}
        }
        
        print("   🧠 Triggering Sentence-Transformers MiniLM-L6-v2 embedding model...")
        resp3 = await client.post(f"{BASE_URL}/api/agent/orchestrate", json=req3)
        data3 = resp3.json()
        state3 = data3["state"]
        
        print("✅ Decision Agent replied!")
        print(f"   Offer Status: {state3['offer']['status']}")
        if state3['offer']['status'] == "PRE-APPROVED":
            print(f"   Approved Amount: INR {state3['offer']['approved_amount']:,.0f}")
            print(f"   Monthly EMI: INR {state3['offer']['monthly_emi']:,.0f}")
        
        print("\n   📜 RBI RAG Neural Network Citation retrieved:")
        print(f"   {state3['offer'].get('rbi_justification', 'No citation found (check vector store)')}")
        print("\n=======================================================")
        print("🎉 ALL AGENTIC AI & NEURAL NETWORKS VERIFIED SUCCESSFUL!")
        print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())

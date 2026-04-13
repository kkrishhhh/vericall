"""VeriCall Document Matcher Phase — Groq Vision Agent."""

import os
import json
from groq import Groq

# Reuse Groq API Key
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
VISION_MODEL = os.environ.get(
    "GROQ_VISION_MODEL",
    "meta-llama/llama-4-scout-17b-16e-instruct",
)

def verify_address_match(aadhaar_b64: str, proof_b64: str) -> dict:
    """
    Sends both the Aadhaar and Address Proof to Groq LLaMA 3.2 Vision.
    Extracts the addresses and determines if they semantically match.
    """
    
    prompt = """You are an strict KYC compliance agent. You will be provided with two images: 
Image 1 is an Aadhaar Card.
Image 2 is an Address Proof document (like a bill or statement).

TASK:
1. Extract the full address written on the Aadhaar Card.
2. Extract the full address written on the Address Proof.
3. Compare the two addresses. Do they represent the exact same physical location? Provide a boolean true/false. Be lenient with formats (e.g., 'Apt 4' vs 'Flat 4'), but strict on the actual location (pincode, street).
4. Provide a brief reason for your decision. If they don't match, explicitly state why.

OUTPUT FORMAT IN STRICT JSON:
{
  "aadhaar_address": "extracted address or null",
  "proof_address": "extracted address or null",
  "matches": true/false,
  "reason": "Brief explanation of the match or mismatch"
}"""

    # Cleanup base64 prefixes if they exist
    if "," in aadhaar_b64:
        aadhaar_b64 = aadhaar_b64.split(",", 1)[1]
    if "," in proof_b64:
        proof_b64 = proof_b64.split(",", 1)[1]

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text", 
                    "text": prompt
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{aadhaar_b64}",
                    },
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{proof_b64}",
                    },
                }
            ],
        }
    ]

    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=messages,
            temperature=0.1, # Lowest temperature for accuracy
            response_format={"type": "json_object"}
        )
        
        reply = response.choices[0].message.content
        data = json.loads(reply)
        return data

    except Exception as e:
        msg = str(e)
        if "model_decommissioned" in msg:
            msg = (
                f"{msg}. Update GROQ_VISION_MODEL to a currently supported vision model, "
                "for example: meta-llama/llama-4-scout-17b-16e-instruct"
            )
        # Fallback if vision extraction fails entirely
        print(f"Vision API Error: {msg}")
        return {
            "aadhaar_address": "Error extracting",
            "proof_address": "Error extracting",
            "matches": False,
            "reason": f"System encountered an error processing the images: {msg}"
        }

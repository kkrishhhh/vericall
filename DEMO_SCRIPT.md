# Vantage Demo Script

## Pre-demo checklist
- [ ] Backend running locally on port 8000
- [ ] Frontend running on port 3000
- [ ] Camera access allowed in browser

## Demo flow (5 minutes)
1. **Open localhost:3000 — show landing page**
   - Present the modern, dark-mode landing page styled with glassmorphism.
   - Point out the language selector in the navigation bar showing support for English, Hindi, and Marathi.
2. **Click Request Video KYC**
   - Click the "Request Video KYC" action button.
   - Fill in details (Name, Email, Mobile number) and highlight the granular DPDPA consent checkboxes (Video recording, data processing, identity check).
3. **Enter phone number → OTP flow**
   - Submit the form to trigger the OTP flow.
   - Check the backend console output where the simulated SMS OTP is printed (e.g. `123456`).
   - Enter this OTP in the frontend to verify the session and begin the call setup.
4. **Liveness check**
   - Allow camera access. The UI will request a liveness challenge from the backend.
   - Perform the requested gesture challenge displayed on screen (e.g., "Please show 2 fingers to the camera").
   - Wait a moment for the system to verify the frames and green-light the transition.
5. **KYC document upload**
   - Upload sample Aadhaar and PAN document images (use mock placeholders if needed).
   - The backend runs OCR on the uploads, validates formats and Verhoeff checksums, and performs cross-field matching (matching names and birth dates across documents).
6. **Agent conversation**
   - Engage with the virtual AI agent over the video interface.
   - Speak to answer the agent's questions; the system streams real-time speech-to-text (Deepgram) and the agent responds verbally (native TTS).
   - Once all 7 onboarding questions are answered, view the customized pre-approved loan offer card generated dynamically with EMI options.
7. **Open localhost:3000/admin — show case appeared**
   - In a new browser window, navigate to the `/admin` portal.
   - Log in using credentials `admin` / `admin123`.
   - Show the newly created customer case listed in the application queue with its status (e.g., "pending" or "review") and calculated risk levels.
8. **Show approve/reject buttons**
   - Click on the case detail view.
   - Demonstrate the decision override tools (Approve, Reject, Needs-Review) along with the officer note input field.

## What to say if reviewers ask
- **"Is this production ready?"** → "No, this is a prototype. README lists what is mocked."
- **"Is CIBIL real?"** → "No, MockBureauProvider. Cannot create real approvals."
- **"Is liveness real?"** → "Challenge verification is wired to backend. Face match uses DeepFace."

## Known issues to not demo
- **Live Government Database Verification**: Aadhaar/PAN validation runs format and checksum checks locally; there is no live connection to UIDAI, NSDL, or GST networks.
- **Production AWS Deployment**: The infrastructure configuration scripts are in progress; the app is not currently hosted in a live cloud environment.
- **SMS Gateway Dispatch**: SMS messages are simulated; OTPs must be read from the backend server logs.

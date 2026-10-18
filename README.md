# DataStraw AI Voice Agent — Aura Skincare

A browser voice-and-chat support prototype for the DataStraw assessment. The frontend uses browser speech recognition for voice input, server-generated Groq speech for replies (with browser speech as a fallback), and a text chat option in the same conversation. The Express backend sends messages to Groq, exposes order and policy functions to the model, stores a short-lived transcript, automatically closes clearly finished conversations, prepares a structured recap, and saves post-call feedback in SQLite.

## Requirements

- Node.js 22.12 or newer (below 25) and npm
- A Groq API key, stored only in the server environment
- The SQLite feedback store uses a native Node.js package
- A browser with Web Speech API recognition and speech synthesis (latest Chrome or Edge recommended)

## Configure Groq locally

In PowerShell, copy the server example environment file and add your key locally:

```powershell
cd server
Copy-Item .env.example .env
```

Create a key at [GroqCloud API Keys](https://console.groq.com/keys). Open `server/.env` and set `GROQ_API_KEY` to that key. Keep `.env` private; do not commit it or put the key in a `VITE_` variable. The chat model, generated speech model, and speech voice can be set with `GROQ_MODEL`, `GROQ_TTS_MODEL`, and `GROQ_TTS_VOICE`.

## Run locally

Start the backend in one PowerShell window:

```powershell
cd "C:\Users\Payal Goswami\Desktop\assignment\voice assistant\server"
npm install
npm start
```

Start the frontend in a second window:

```powershell
cd "C:\Users\Payal Goswami\Desktop\assignment\voice assistant\client"
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`) in Chrome or Edge and allow microphone access after selecting **Start call**. Local development connects to `http://localhost:5000` by default. To use the deployed API locally, copy `client/.env.example` to `client/.env.local`; local Vite origins are allowed by the deployed backend. Production builds use `https://auraskin-api-d6wb.onrender.com` by default. You can override it with `VITE_API_BASE_URL` if the API URL changes.

## Checks

Backend tests:

```powershell
cd server
npm test
```

Frontend production build:

```powershell
cd client
npm run build
```

## Architecture

- `client/src/components/` — voice/chat controls, text composer, live transcript, call recap, sample orders, and policy UI
- `client/src/hooks/useCallSession.js` — browser call lifecycle and Listening / Thinking / Speaking states
- `client/src/services/voiceService.js` — browser speech recognition and speech synthesis adapter
- `client/src/services/api.js` — frontend requests to the backend
- `server/src/services/conversationService.js` — Groq conversation, strict tool allow-list, short-lived session history, and structured recap
- `server/src/services/orderService.js` — assessment order lookup and mock cancellation
- `server/src/services/policyService.js` — deterministic policy checks exposed as Groq tools and API routes
- `server/src/data/orders.js` — the three assessment mock orders

## API overview

- `GET /api/health`
- `GET /api/orders/:orderId`
- `POST /api/orders/:orderId/cancel`
- `POST /api/policies/{shipping,returns,damaged-product,cash-on-delivery}`
- `POST /api/conversations/:sessionId/turn` with `{ "text": "..." }`
- `POST /api/conversations/:sessionId/speech` to generate speech for the latest assistant reply
- `POST /api/conversations/:sessionId/end` to return the transcript and structured recap
- `POST /api/feedback` with `{ "sessionId": "...", "rating": "up"|"down", "comment": "..." }` after a call ends

## Limitations and deployment

Voice recognition support depends on the browser and its speech service; test in Chrome or Edge over localhost or HTTPS. Groq speech generation takes an extra request and may add a pause before spoken replies; the text transcript updates first, and browser speech is used if generated audio is unavailable. Calls and mock order data are kept in memory and are cleared when the server restarts. Feedback is stored in `server/data/aura-feedback.sqlite` and that local database file is ignored by Git. Deployment configuration and setup steps are in [DEPLOYMENT.md](DEPLOYMENT.md). Never expose the Groq key to browser code.

## Assessment reflection

### 1. Why did you choose this architecture and technology stack?

I chose React with Vite for a quick, responsive browser interface and Node.js with Express for a small API that keeps the Groq key off the client. The backend exposes order and policy operations as controlled tools, so policy decisions come from application logic instead of relying on the model to calculate or invent outcomes. Browser speech recognition keeps voice input simple to try, Groq generates the assistant's reply and spoken audio, and SQLite stores post-call feedback.

### 2. What was the most difficult part, and how did you solve it?

The hardest part was coordinating voice recognition, the assistant response, audio playback, and the call state without restarting the microphone while Aria was speaking. I kept the conversation flow in a dedicated hook, made voice and chat share the same turn handling, added safeguards around the listening and speaking states, and split long speech requests to respect the speech provider's input limit.

### 3. With one more week, what would you improve first and why?

I would improve speech recognition reliability first. I would test common order and policy questions across browsers, accents, and background-noise levels, then use those results to improve transcription while keeping chat available whenever voice input is unclear.

### 4. What would need to change to handle 1,000 customer conversations per day?

I would move conversation state and order data from process memory to a managed database, make the API stateless so it can scale across instances, and add request limits and monitoring for provider latency, failures, and usage. I would also queue or otherwise control speech-generation requests, protect customer data with a defined retention policy, and add load tests before increasing traffic.

## Approach note for the submission email

I built a browser-based Aura Skincare support agent with React and Express, using Groq for conversation and spoken replies. The backend handles order and policy checks through controlled tools, while the app supports voice and chat, shows a transcript and structured call recap, and stores post-call feedback in SQLite. The frontend and API are deployed publicly so the evaluator can try the experience in a browser.

## Submission checklist

The assessment also asks for a public application URL, a GitHub repository, a 3–5 minute demo video, a 2–3 sentence approach note, and an accessible LinkedIn profile link. Copy the approach note above into the submission email along with those links, and submit to the recipients listed in the assessment PDF.

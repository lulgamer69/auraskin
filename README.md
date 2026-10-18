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

Open the Vite URL (usually `http://localhost:5173`) in Chrome or Edge and allow microphone access after selecting **Start call**. Locally, the frontend connects to `http://localhost:5000` by default. `client/.env.example` is only needed if you want to override the backend URL with `VITE_API_BASE_URL`.

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

Add your personal answers before submission:

1. Why did you choose this architecture and technology stack?
2. What was the most difficult part, and how did you solve it?
3. With one more week, what would you improve first and why?
4. What would need to change to handle 1,000 customer conversations per day?

## Submission checklist

The assessment also asks for a public application URL, a GitHub repository, a 3–5 minute demo video, a 2–3 sentence approach note, and an accessible LinkedIn profile link. Submit those items to the recipients listed in the assessment PDF.

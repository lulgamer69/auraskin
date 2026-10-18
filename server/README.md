# Aura Skincare Backend

JavaScript + Express backend for the DataStraw Aura Skincare assessment. It contains the supplied order records, deterministic policy checks, mock cancellation, a Groq-powered conversation endpoint with function calling and generated speech, and a small SQLite store for post-call feedback.

## Requirements and startup

Node.js 22 or newer (below 25) and npm are required. `better-sqlite3` needs Node.js 22 or newer.

```powershell
cd server
npm install
Copy-Item .env.example .env
npm start
```

Add your Groq API key to `server/.env` as `GROQ_API_KEY`. You may set `GROQ_MODEL`, `GROQ_TTS_MODEL`, and `GROQ_TTS_VOICE` to models and voices available to your key. Voice input uses the browser's built-in speech recognition; recorded audio is not uploaded for transcription. Never put the Groq key in the frontend or commit `.env`.

The API listens on port `5000` by default. Set `$env:PORT = '5050'` before `npm start` to choose another valid port. For auto-restart during development, use `npm run dev`.

Browser requests from local Vite origins `http://localhost:5173` and `http://127.0.0.1:5173` are allowed by default. Set `CLIENT_ORIGIN` to the exact frontend origin in deployment; comma-separated origins are supported. Requests without an `Origin` header remain usable. CORS is a browser access rule, not authentication.

## Endpoints

All successful responses use a `{ "data": ... }` envelope. Errors use `{ "error": { "code": "...", "message": "..." } }`.

### Health

`GET /api/health`

Returns `{ "data": { "status": "ok" } }`.

### Voice conversation

`POST /api/conversations/:sessionId/turn` with `{ "text": "Where is ORD-101?" }` returns the assistant reply, transcript, and tool names used. Voice and typed chat use this same endpoint. When the customer clearly says they are done, the assistant can close the conversation; the response includes `callEnded: true`. The server holds conversation context in memory for up to one hour.

`POST /api/conversations/:sessionId/speech` returns generated WAV speech for the latest assistant reply. The client requests it after receiving the text so the transcript updates before audio generation finishes. If speech generation is unavailable, the frontend falls back to browser speech synthesis.

`POST /api/conversations/:sessionId/end` returns the transcript and a structured recap containing `customer_intent`, `order_id`, `resolution_status`, `call_summary`, and `next_steps`. Repeating the end request returns the saved recap. A conversation cannot accept additional turns after it is ended.

The Groq tool allow-list includes order lookup, shipping, return, damaged-product, COD, and cancellation checks. Tool execution always runs through backend services; the model cannot directly access the order store or perform arbitrary functions. A policy check reports eligibility only and does not itself issue a refund or replacement. Groq's speech endpoint is used for generated voice; if it is unavailable, the frontend falls back to browser speech synthesis.

### Post-call feedback

`POST /api/feedback` with `{ "sessionId": "...", "rating": "up"|"down", "comment": "..." }` stores one review per ended call in `server/data/aura-feedback.sqlite`. A thumbs-down review must include a short comment; duplicate submissions are rejected. The local database and its SQLite journal files are ignored by Git.

### Order lookup

`GET /api/orders/:orderId`

Example: `GET http://localhost:5000/api/orders/ORD-101`

Returns the order record for a valid known ID. Malformed IDs return `400 INVALID_ORDER_ID`; syntactically valid but unknown IDs return `404 ORDER_NOT_FOUND`.

For a missing path ID, use `GET /api/orders` without `orderId`; the API returns `400 MISSING_ORDER_ID`. Query lookup is also supported with `GET /api/orders?orderId=ORD-101`.

### Shipping policy

`POST /api/policies/shipping` with `{ "orderTotal": 700 }`.

Orders below ₹499 have a ₹50 shipping fee; orders above ₹499 qualify for free delivery. Exactly ₹499 returns `status: "unspecified"` and a null fee because the assessment does not define that boundary. The 3–5 business day delivery window is included.

### Return policy

`POST /api/policies/returns` with `{ "daysSinceDelivery": 3, "opened": false, "used": false, "originalPackaging": true }`.

Eligibility requires delivery within 7 days and all three product conditions. The result describes eligibility only; it does not process a return or refund.

### Damaged or defective product policy

`POST /api/policies/damaged-product` with `{ "hoursSinceDelivery": 24, "photosProvided": true }`.

Eligibility requires reporting within 48 hours and photos. The result does not issue a replacement.

### Cash on Delivery policy

`POST /api/policies/cash-on-delivery` with `{ "orderTotal": 2500, "paymentMethod": "upi" }`.

COD is eligible up to and including ₹2,500 for `cash` or `upi` payment at the doorstep.

### Mock cancellation

`POST /api/orders/:orderId/cancel` with no request body.

Only a `Processing` order changes to `Cancelled`. Existing orders in other statuses receive `409 CANCELLATION_NOT_ALLOWED`; unknown orders receive 404. An order already cancelled also returns 409. No refund or external cancellation is performed.

## Tests

```powershell
npm test
```

Tests use fresh in-memory stores. They cover the exact order records, invalid and unknown IDs, policy boundaries, cancellation, malformed JSON, and API response behavior. They do not alter the development fixture.

## Limitations

Orders and call sessions live in memory. A successful mock cancellation lasts only until the server process stops and is not shared between multiple server instances. Post-call feedback is stored in SQLite at `server/data/aura-feedback.sqlite`; this local file is suitable for the prototype, but a deployment with ephemeral storage may reset it. Use a persistent disk or managed database if feedback must survive redeployments or be shared across multiple server instances. Local Vite origins `http://localhost:5173` and `http://127.0.0.1:5173` are allowed by default; set `CLIENT_ORIGIN` to the exact deployed frontend origin when deploying.

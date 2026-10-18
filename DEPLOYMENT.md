# Deployment preparation

The repository is prepared for a Vercel frontend and a Render API. This file covers configuration only; the services have not been created or deployed.

## Before deploying

1. Push this repository to a GitHub repository. The current local Git repository has no remote configured yet.
2. Make sure `.env` files and API keys are not staged. The root `.gitignore` excludes them.
3. Rotate the Groq key that was pasted into chat, then use the replacement key only in Render's backend environment settings.

## Deploy the API on Render

1. In Render, create a Blueprint from the GitHub repository. Render will read the root [`render.yaml`](render.yaml).
2. Enter the rotated `GROQ_API_KEY` when Render prompts for it. The API key is intentionally not stored in this repository.
3. The Blueprint configures the backend from `server/`, runs `npm ci` and `npm start`, and checks `GET /api/health`.
4. After the first deploy, copy the service URL, for example `https://aura-skincare-api.onrender.com`.

## Deploy the frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `client`. Vercel uses [`client/vercel.json`](client/vercel.json) to build with `npm run build` and publish `dist/`.
3. Add the environment variable `VITE_API_BASE_URL` with the Render service URL, without a trailing slash. It is a public API URL, not a secret. Do not add `GROQ_API_KEY` to Vercel.
4. Deploy and copy the Vercel site URL, for example `https://aura-skincare.vercel.app`.

## Connect the deployed services

In Render, change `CLIENT_ORIGIN` from the local default to the exact Vercel origin, with no trailing slash. If you use a Vercel preview domain too, the backend supports a comma-separated list of origins. Save the variable and let Render restart the API.

Vite embeds `VITE_API_BASE_URL` at build time, so redeploy the frontend after changing it. In production, the frontend now shows a configuration error instead of silently trying `localhost:5000` if the API URL was omitted.

## Verify the deployment

Open these URLs using the deployed Render base URL:

- `GET /api/health` should return `{ "data": { "status": "ok" } }`.
- `GET /api/orders/ORD-101` should return the sample order.

Then open the Vercel site, test a shipping estimate, try chat, and test voice over HTTPS after granting microphone permission.

## Free-tier limitations

Render's free web service can spin down after 15 minutes without traffic, so the next request may be slow while it starts again. Free web services do not have persistent disks. The SQLite feedback file may be lost on restart or redeploy, and this deployment config does not attach paid storage. Keep this deployment for an assessment demo rather than relying on it as permanent review storage. See [Render's free instance limitations](https://render.com/docs/free) and [Vercel's Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite).

Groq is a separate service from Vercel and Render; deployment does not change the Groq account's API quota or billing. The key remains on the backend only.

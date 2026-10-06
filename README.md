# SentinelBI

Enterprise-style AI analytics workspace. Generate unique dashboards from uploaded data, chat with a governed agent stack, and connect Gemini or any OpenAI-compatible API (OpenRouter, OpenAI, Groq, Together, DeepSeek, Mistral, Ollama, LM Studio, custom base URL).

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and set a provider key if you want live model calls. Without a key, dashboards still generate from a data-fitted fallback layout.
3. `npm run dev` — http://localhost:3000

## Scripts

- `npm run dev` — Express + Vite
- `npm run build` — production client + server bundle
- `npm run lint` — `tsc --noEmit`
- `npm test` — provider layer and dashboard spec tests

## AI configuration

Open **Settings** to pick a provider, base URL, model, and key. Keys stay in the browser (`localStorage`) or in server env vars. They are never written into the repository.

Gemini remains available through `/api/gemini` and the unified `/api/ai` router.

## Vercel

Production uses a single serverless entry (`api/index.js`, bundled from `src/server/vercel-entry.ts`) plus SPA rewrites in `vercel.json`. Configure these **environment variables** on the Vercel project (names only — never commit values):

- `AI_PROVIDER` (default `gemini`)
- `AI_MODEL` / `OPENROUTER_MODEL`
- `AI_BASE_URL`
- `AI_API_KEY` or a provider key: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`
- `AI_DEADLINE_MS` (optional; defaults to 50s on Vercel)
- `BLOB_READ_WRITE_TOKEN` and/or `KV_REST_API_URL` + `KV_REST_API_TOKEN` for durable `/d/:id` share links
- `APP_URL` (public site URL, used as OpenRouter HTTP-Referer when set)

If no Blob/KV is configured, generated share links are per-instance and expire; `/d/:id` then shows a friendly 404. Workspace dashboards still render from client state.

Smoke the deployment with `BASE_URL=https://your-preview.vercel.app npm run smoke`.

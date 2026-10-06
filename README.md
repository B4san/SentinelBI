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

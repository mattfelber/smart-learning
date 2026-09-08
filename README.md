# Smart Learning

A locally-hosted personal AI tutor for coding and technical topics. It uses a free hosted LLM for reasoning while keeping all learner state on disk.

## Quick start

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Create a `.env` file in the project root:

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.8-flash
```

3. Install dependencies and start:

```bash
npm install
npm run dev
```

4. Open http://localhost:5173 and type what you want to learn, e.g.:

```
Sliding window algorithms for coding interviews
```

## What works

- New-topic creation
- Initial knowledge probing
- Adaptive tutoring through a Tutor Orchestrator
- Streaming tutor responses (SSE) with a live typing view
- Learner control commands ("move on", "just tell me", "focus on interviews") handled without extra model calls, plus a probe budget so the tutor stops looping questions
- Prediction-before-reveal prompts
- Progressive hint ladder
- Basic misconception tracking
- Learner state persistence
- AI-directed visuals: the tutor emits a structured `VisualSpec` (array, key-value, set, diagram) rendered by deterministic React components; sliding-window lessons still get the interactive step-scrubbed trace
- Whiteboard continuity — visuals persist across turns until the tutor replaces or clears them
- Topic/session vault to reopen past work
- Per-request token usage and cost tracking
- Session resume
- Markdown session summary

## Architecture

See `ARCHITECTURE.md`, `CONTEXT_STRATEGY.md`, `LEARNING_MODEL.md`, `MODEL_PROVIDERS.md`, and `DEVELOPMENT.md`.

Mobile: `npm run dev` prints a QR code for the LAN address (vite-plugin-qrcode), so you can open the app on a phone.

## Data

Learner data is stored in `learning-data/` as JSON, JSONL, and Markdown. It never leaves your machine except for the text sent to the Gemini API.

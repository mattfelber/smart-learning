# Development

## Setup

1. Copy `.env.example` to `.env` in the project root (the config loader walks up from `server/`).
2. Add your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Install dependencies:

```powershell
npm install
```

## Run

```powershell
npm run dev
```

This starts the Vite dev server for the UI and the Express API on separate ports.

## Build

```powershell
npm run build
```

## Test

```powershell
npm test
```

## Project Structure

```
client/          React + Vite
server/          Express + TypeScript
shared/          Shared types
```

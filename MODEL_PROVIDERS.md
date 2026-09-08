# Model Providers

## Interface

```typescript
interface GenerateRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
}

interface GenerateResponse {
  text: string;
  /** Full token accounting, thinking tokens included. */
  usage?: TokenUsage;
  /** Which model in the fallback chain actually answered. */
  model?: string;
}

interface LLMProvider {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  generateStream?(req: GenerateRequest, onText: (textSoFar: string) => void): Promise<GenerateResponse>;
  supportsJson(): boolean;
}
```

## Implemented

- `GeminiProvider` — uses `@google/genai`. First model from `GEMINI_MODEL`, then the `GEMINI_FALLBACKS` chain (each model has its own free daily quota). Per attempt: first-token watchdog `GEMINI_FIRST_TOKEN_TIMEOUT_MS`, hard cap `GEMINI_REQUEST_TIMEOUT_MS`. Optional `GEMINI_THINKING_LEVEL`.

## Future

- `GroqProvider`
- `OpenRouterProvider`
- `OpenAIProvider`
- `OllamaProvider`

The Tutor Orchestrator only depends on the `LLMProvider` interface.

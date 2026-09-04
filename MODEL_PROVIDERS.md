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
  usage?: { inputTokens: number; outputTokens: number };
}

interface LLMProvider {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  supportsJson(): boolean;
}
```

## Implemented

- `GeminiProvider` — uses `@google/genai`, model configured by `GEMINI_MODEL`.

## Future

- `GroqProvider`
- `OpenRouterProvider`
- `OpenAIProvider`
- `OllamaProvider`

The Tutor Orchestrator only depends on the `LLMProvider` interface.

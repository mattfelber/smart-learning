import { GoogleGenAI, createUserContent, createModelContent } from '@google/genai';
import type { GenerateRequest, GenerateResponse, TokenUsage } from '@smart-learning/shared';
import type { LLMProvider } from './types.js';
import { classifyProviderError } from './errors.js';

interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

function toUsage(meta: UsageMetadataLike | undefined): TokenUsage | undefined {
  if (!meta) return undefined;
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    // Reported separately from candidates but billed as output, so ignoring it
    // understates cost on every thinking model.
    thoughtTokens: meta.thoughtsTokenCount ?? 0,
    cachedTokens: meta.cachedContentTokenCount ?? 0,
    totalTokens: meta.totalTokenCount ?? 0
  };
}

/** Retryable on the next model: out of quota, busy, or retired. */
function shouldTryNextModel(message: string): boolean {
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|\b429\b|\b503\b|\b404\b|timed? ?out|TimeoutError|DEADLINE/i.test(message);
}

/** Thinking levels are model-specific; 3.8-flash rejects MINIMAL, for instance. */
function isUnsupportedThinkingLevel(message: string): boolean {
  return /[Tt]hinking level .* is not supported|thinking_level/.test(message);
}

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;
  private fallbacks: string[];

  /**
   * The free tier meters requests per model per day, so every extra model in
   * this chain is extra daily headroom. The flash models are the better
   * teachers but carry a very small daily allowance; the flash-lite models are
   * weaker yet allow far more requests, which makes them the right safety net
   * rather than the first choice.
   *
   * Verified against the live models endpoint: 2.5-flash and 2.5-flash-lite are
   * listed but return 404, and the gemma models ignore JSON mode, so none of
   * them belong here.
   */
  static readonly DEFAULT_CHAIN = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ];

  constructor(
    private apiKey: string,
    model: string,
    chain?: string[],
    private thinkingLevel?: string,
    private firstTokenTimeoutMs = 25000,
    private requestTimeoutMs = 120000
  ) {
    this.client = new GoogleGenAI({ apiKey });
    const candidates = chain?.length ? chain : GeminiProvider.DEFAULT_CHAIN;
    this.fallbacks = [...new Set([model, ...candidates.filter((m) => m !== model)])];
  }

  private configFor(req: GenerateRequest, withThinking: boolean) {
    return {
      systemInstruction: req.system ? createModelContent(req.system) : undefined,
      temperature: req.temperature ?? 0.5,
      maxOutputTokens: req.maxTokens ?? 1024,
      responseMimeType: req.responseMimeType ?? 'text/plain',
      ...(withThinking && this.thinkingLevel
        ? { thinkingConfig: { thinkingLevel: this.thinkingLevel as never } }
        : {})
    };
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    return this.run(req, undefined);
  }

  async generateStream(
    req: GenerateRequest,
    onProgress: (rawSoFar: string) => void
  ): Promise<GenerateResponse> {
    return this.run(req, onProgress);
  }

  /**
   * One walk down the fallback chain. When onProgress is supplied the streaming
   * API is used and partial text is reported as it arrives; either way the
   * resolved value is the same complete response, so callers downstream do not
   * need to know which mode was used.
   */
  private async run(
    req: GenerateRequest,
    onProgress: ((rawSoFar: string) => void) | undefined
  ): Promise<GenerateResponse> {
    const contents = [createUserContent(req.prompt)];
    const errors: string[] = [];

    for (const model of this.fallbacks) {
      // Retry the same model without thinkingConfig if it rejects the level.
      for (const withThinking of [true, false]) {
        if (!withThinking && !this.thinkingLevel) break;
        const controller = new AbortController();
        // The SDK keeps a stalled request open without any error, so bound each
        // attempt two ways: an HTTP timeout caps the whole call, and — when
        // streaming — a watchdog aborts the model if it has not produced a first
        // text chunk in time. An aborted attempt falls through to the next model.
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        try {
          const config = {
            ...this.configFor(req, withThinking),
            abortSignal: controller.signal,
            httpOptions: { timeout: this.requestTimeoutMs }
          };
          let text = '';
          let meta: UsageMetadataLike | undefined;

          if (onProgress) {
            watchdog = setTimeout(() => controller.abort(), this.firstTokenTimeoutMs);
            const stream = await this.client.models.generateContentStream({
              model,
              contents,
              config
            });
            for await (const chunk of stream) {
              const piece = chunk.text ?? '';
              if (piece) {
                text += piece;
                clearTimeout(watchdog);
                onProgress(text);
              }
              if (chunk.usageMetadata) meta = chunk.usageMetadata;
            }
          } else {
            const interaction = await this.client.models.generateContent({
              model,
              contents,
              config
            });
            text = interaction.text ?? '';
            meta = interaction.usageMetadata;
          }

          if (!text) {
            errors.push(`${model}: empty response`);
            break;
          }
          return { text, model, usage: toUsage(meta) };
        } catch (err: unknown) {
          if (controller.signal.aborted) {
            errors.push(`${model}: no response within ${this.firstTokenTimeoutMs}ms`);
            console.warn(`[gemini] ${model} timed out before its first token; trying next model`);
            break;
          }
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${model}: ${message}`);
          if (withThinking && this.thinkingLevel && isUnsupportedThinkingLevel(message)) {
            console.warn(
              `[gemini] ${model} rejected thinkingLevel=${this.thinkingLevel}; retrying without it`
            );
            continue;
          }
          if (!shouldTryNextModel(message)) {
            const raw = errors.join('; ');
            const error = classifyProviderError(raw, this.fallbacks);
            console.error(`[gemini] ${error.kind}: ${raw}`);
            throw error;
          }
          break;
        } finally {
          clearTimeout(watchdog);
        }
      }
    }

    const raw = errors.join('; ');
    const error = classifyProviderError(raw, this.fallbacks);
    console.error(`[gemini] ${error.kind}: ${raw}`);
    throw error;
  }

  supportsJson(): boolean {
    return true;
  }
}

import { GoogleGenAI, createUserContent, createModelContent } from '@google/genai';
import type { GenerateRequest, GenerateResponse } from '@smart-learning/shared';
import type { LLMProvider } from './types.js';
import { classifyProviderError } from './errors.js';

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

  constructor(private apiKey: string, model: string, chain?: string[]) {
    this.client = new GoogleGenAI({ apiKey });
    const candidates = chain?.length ? chain : GeminiProvider.DEFAULT_CHAIN;
    this.fallbacks = [...new Set([model, ...candidates.filter((m) => m !== model)])];
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const systemInstruction = req.system ? createModelContent(req.system) : undefined;
    const contents = [createUserContent(req.prompt)];
    const errors: string[] = [];

    for (const model of this.fallbacks) {
      try {
        const interaction = await this.client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: req.temperature ?? 0.5,
            maxOutputTokens: req.maxTokens ?? 1024,
            responseMimeType: req.responseMimeType ?? 'text/plain'
          }
        });

        const text = interaction.text ?? '';
        if (!text) {
          errors.push(`${model}: empty response`);
          continue;
        }

        const meta = interaction.usageMetadata;
        return {
          text,
          model,
          usage: meta
            ? {
                inputTokens: meta.promptTokenCount ?? 0,
                outputTokens: meta.candidatesTokenCount ?? 0,
                // Reported separately from candidates but billed as output, so
                // ignoring it understates cost on every thinking model.
                thoughtTokens: meta.thoughtsTokenCount ?? 0,
                cachedTokens: meta.cachedContentTokenCount ?? 0,
                totalTokens: meta.totalTokenCount ?? 0
              }
            : undefined
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${model}: ${message}`);
        // Move to the next model when this one is out of quota, busy, or simply
        // gone. Retired model ids still appear in the models listing and return
        // 404, which previously aborted the entire chain.
        const tryNext =
          /UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|\b429\b|\b503\b|\b404\b/.test(message);
        if (!tryNext) break;
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

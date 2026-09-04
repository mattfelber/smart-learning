import { GoogleGenAI, createUserContent, createModelContent } from '@google/genai';
import type { GenerateRequest, GenerateResponse } from '@smart-learning/shared';
import type { LLMProvider } from './types.js';
import { classifyProviderError } from './errors.js';

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;
  private fallbacks: string[];

  constructor(private apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    const candidates = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    const ordered = [model, ...candidates.filter((m) => m !== model)];
    this.fallbacks = [...new Set(ordered)];
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

        return {
          text,
          usage: interaction.usageMetadata
            ? {
                inputTokens: interaction.usageMetadata.promptTokenCount ?? 0,
                outputTokens: interaction.usageMetadata.candidatesTokenCount ?? 0
              }
            : undefined
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${model}: ${message}`);
        const isUnavailable = message.includes('UNAVAILABLE') || message.includes('429') || message.includes('503');
        if (!isUnavailable) break;
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

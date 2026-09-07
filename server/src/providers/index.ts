import { config } from '../config.js';
import { GeminiProvider } from './gemini.js';
import type { LLMProvider } from './types.js';

export function createProvider(): { provider: LLMProvider; configured: boolean; error?: string } {
  if (config.LLM_PROVIDER === 'gemini') {
    if (!config.GEMINI_API_KEY) {
      return {
        provider: new GeminiProvider(
          'placeholder',
          config.GEMINI_MODEL,
          config.GEMINI_FALLBACKS,
          config.GEMINI_THINKING_LEVEL,
          config.GEMINI_FIRST_TOKEN_TIMEOUT_MS,
          config.GEMINI_REQUEST_TIMEOUT_MS
        ),
        configured: false,
        error:
          'Gemini API key is missing. Create a .env file from .env.example and set GEMINI_API_KEY.'
      };
    }
    return {
      provider: new GeminiProvider(
        config.GEMINI_API_KEY,
        config.GEMINI_MODEL,
        config.GEMINI_FALLBACKS,
        config.GEMINI_THINKING_LEVEL,
        config.GEMINI_FIRST_TOKEN_TIMEOUT_MS,
        config.GEMINI_REQUEST_TIMEOUT_MS
      ),
      configured: true
    };
  }

  return { provider: new GeminiProvider('placeholder', 'gemini-3.8-flash'), configured: false, error: 'Unsupported provider' };
}

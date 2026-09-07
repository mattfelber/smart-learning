import type { GenerateRequest, GenerateResponse } from '@smart-learning/shared';

export interface LLMProvider {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  /**
   * Same contract as generate, but reports the raw text accumulated so far as it
   * arrives. Optional so providers can omit it; callers fall back to generate.
   */
  generateStream?(
    req: GenerateRequest,
    onProgress: (rawSoFar: string) => void
  ): Promise<GenerateResponse>;
  supportsJson(): boolean;
}

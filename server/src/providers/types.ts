import type { GenerateRequest, GenerateResponse } from '@smart-learning/shared';

export interface LLMProvider {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  supportsJson(): boolean;
}

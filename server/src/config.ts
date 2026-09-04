import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function findEnvFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const envPath = resolve(dir, '.env');
    if (existsSync(envPath)) return envPath;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadDotenv(): void {
  const envPath = findEnvFile();
  if (!envPath) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length && !key.startsWith('#')) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

loadDotenv();

const schema = z.object({
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  PORT: z.string().default('3001').transform(Number),
  DATA_DIR: z.string().default(resolve(process.cwd(), '../learning-data'))
});

export type Config = z.infer<typeof schema>;

export const config = schema.parse(process.env);

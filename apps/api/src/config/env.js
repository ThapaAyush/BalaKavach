import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
  MONGODB_URI: z.string().trim().optional().transform((value) => value || undefined),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid server environment configuration: ${fields}`);
}

export const env = Object.freeze(result.data);

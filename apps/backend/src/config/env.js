import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
  MONGODB_URI: z.string().trim().optional().transform((value) => value || undefined),
  CLIENT_ORIGIN: z.string()
    .trim()
    .refine((val) => {
      const parts = val.split(',').map((p) => p.trim());
      return parts.length > 0 && parts.every((p) => {
        try {
          const u = new URL(p);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      });
    }, { message: 'Must be a valid URL or comma-separated list of URLs' })
    .transform((value) => value.split(',').map((p) => p.trim().replace(/\/+$/, '')).join(','))
    .default('https://bala-kavach-fe.vercel.app'),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
  SESSION_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('none'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid server environment configuration: ${fields}`);
}

export const env = Object.freeze(result.data);

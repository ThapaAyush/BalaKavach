import { z } from 'zod';

const displayNameSchema = z.string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => !/[\u0000-\u001f\u007f]/u.test(name));

export const createPairingCodeSchema = z.object({}).strict().optional();

export const deviceHeartbeatSchema = z.object({}).strict().optional();

export const redeemPairingCodeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  name: displayNameSchema,
  platform: z.enum(['android', 'ios', 'windows', 'macos', 'linux', 'unknown']),
}).strict();

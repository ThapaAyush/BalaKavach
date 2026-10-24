import { z } from 'zod';

const webVisitItemSchema = z.object({
  url: z.string().trim().url({ message: 'URL must be a valid HTTP(S) URL.' }).max(2048),
  title: z.string().max(500).optional().default(''),
  domain: z.string().trim().max(253).optional(),
  visitedAt: z.union([
    z.string().datetime({ message: 'visitedAt must be a valid ISO 8601 string.' }),
    z.number().int().positive({ message: 'visitedAt epoch timestamp must be positive.' }),
  ]),
  visitCount: z.number().int().min(1).max(100000).optional().default(1),
  isBlocked: z.boolean().optional().default(false),
  category: z.string().max(50).optional().default('general'),
}).strict();

export const ingestWebHistorySchema = z.object({
  visits: z.array(webVisitItemSchema).min(1, 'At least one visit entry is required.').max(200, 'Cannot exceed 200 visit entries per batch.'),
}).strict();

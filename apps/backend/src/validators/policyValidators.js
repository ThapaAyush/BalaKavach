import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const labelRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function normalizeDomain(rawInput) {
  if (typeof rawInput !== 'string') return null;
  let candidate = rawInput.trim();
  if (!candidate) return null;

  try {
    if (candidate.includes('://')) {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (parsed.username || parsed.password || parsed.port) return null;
      if (parsed.pathname && parsed.pathname !== '/') return null;
      if (parsed.search || parsed.hash) return null;
      candidate = parsed.hostname;
    }
  } catch {
    return null;
  }

  candidate = candidate.replace(/\.+$/u, '').toLowerCase();
  if (candidate.length === 0 || candidate.length > 253) return null;
  if (ipv4Regex.test(candidate)) return null;

  try {
    candidate = new URL(`https://${candidate}`).hostname;
  } catch {
    return null;
  }

  const labels = candidate.split('.');
  if (labels.length < 2) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;

  for (const label of labels) {
    if (!label || label.length > 63 || !labelRegex.test(label)) {
      return null;
    }
  }

  if (candidate.startsWith('www.') && labels.length > 2) {
    candidate = candidate.slice(4);
  }

  return candidate;
}

const domainSchema = z.string().transform((val, ctx) => {
  const normalized = normalizeDomain(val);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid domain name.',
    });
    return z.NEVER;
  }
  return normalized;
});

const dayEnum = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const quietHoursSchema = z.object({
  enabled: z.boolean().optional(),
  start: z.string().regex(timeRegex, { message: 'Start time must be in HH:mm format (00:00-23:59).' }).optional(),
  end: z.string().regex(timeRegex, { message: 'End time must be in HH:mm format (00:00-23:59).' }).optional(),
  days: z.array(dayEnum).optional(),
}).strict();

const screenTimeSchema = z.object({
  dailyLimitMinutes: z.union([
    z.number().int().min(1, 'Daily limit must be at least 1 minute.').max(1440, 'Daily limit cannot exceed 1440 minutes (24 hours).'),
    z.null(),
  ]).optional(),
  quietHours: quietHoursSchema.optional(),
}).strict();

const blockedAppItemSchema = z.union([
  z.string().trim().min(1, 'App identifier cannot be empty.').max(150),
  z.object({
    packageName: z.string().trim().min(1, 'Package name cannot be empty.').max(150),
    appName: z.string().trim().max(100).optional().default(''),
  }).strict(),
]);

const appRestrictionsSchema = z.object({
  enabled: z.boolean().optional(),
  blockedApps: z.array(blockedAppItemSchema).max(100, 'Cannot exceed 100 blocked apps.').optional(),
}).strict();

const webRestrictionsSchema = z.object({
  enabled: z.boolean().optional(),
  blockedDomains: z.array(domainSchema).max(100, 'Cannot exceed 100 blocked domains.').optional(),
}).strict();

export const updatePolicySchema = z.object({
  screenTime: screenTimeSchema.optional(),
  appRestrictions: appRestrictionsSchema.optional(),
  webRestrictions: webRestrictionsSchema.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one policy setting must be provided.',
});

export const acknowledgePolicySchema = z.object({
  acknowledgedVersion: z.number().int().min(1, 'Acknowledged version must be a positive integer.'),
}).strict();

import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const appUsageItemSchema = z.object({
  packageName: z.string().trim().min(1).max(150),
  appName: z.string().trim().min(1).max(100),
  durationSeconds: z.number().int().min(0).max(86400),
  openCount: z.number().int().min(0).max(100000).optional(),
}).strict();

export const ingestScreenTimeSchema = z.object({
  date: z.string().regex(dateRegex, { message: 'Date must be formatted as YYYY-MM-DD.' }),
  totalScreenTimeSeconds: z.union([
    z.number().int().min(0).max(86400),
    z.null(),
  ]),
  deviceUnlockCount: z.number().int().min(0).max(100000).optional(),
  reportingPeriod: z.object({
    start: z.string().datetime({ message: 'Reporting period start must be a valid ISO 8601 datetime.' }),
    end: z.string().datetime({ message: 'Reporting period end must be a valid ISO 8601 datetime.' }),
  }).strict(),
  permissionGranted: z.boolean(),
  source: z.enum(['measured', 'unavailable', 'incomplete']).optional(),
  appUsage: z.array(appUsageItemSchema).max(50, 'App usage list cannot exceed 50 entries.').optional(),
}).strict().refine((data) => {
  // If permission is false, totalScreenTimeSeconds must be null (zero fabrication)
  if (!data.permissionGranted && data.totalScreenTimeSeconds !== null) {
    return false;
  }
  return true;
}, {
  message: 'Screen time duration must be null when permission is not granted.',
  path: ['totalScreenTimeSeconds'],
});

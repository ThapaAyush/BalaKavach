import { z } from 'zod';

const validDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value <= new Date().toISOString().slice(0, 10);
};

const displayNameSchema = z.string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => !/[\u0000-\u001f\u007f]/u.test(name));

const dateOfBirthSchema = z.string().refine(validDateOnly, {
  message: 'Date of birth must be a valid date no later than today.',
});

export const createChildProfileSchema = z.object({
  displayName: displayNameSchema,
  dateOfBirth: dateOfBirthSchema.optional(),
}).strict();

export const updateChildProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  dateOfBirth: z.union([dateOfBirthSchema, z.null()]).optional(),
}).strict().refine((updates) => Object.keys(updates).length > 0);

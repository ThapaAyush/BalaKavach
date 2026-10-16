import { z } from 'zod';

const emailSchema = z.string()
  .trim()
  .max(254)
  .email()
  .transform((email) => email.toLowerCase());

export const registrationSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(8)
    .max(128)
    .refine((password) => password.trim().length > 0),
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
}).strict();

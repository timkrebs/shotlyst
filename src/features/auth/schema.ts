import { z } from "zod";

import { en } from "@/messages/en";

export const PASSWORD_MIN_LENGTH = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: en.validation.email }));
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: en.validation.passwordLength })
  .max(72, { error: en.validation.passwordTooLong });
export const displayName = z
  .string()
  .trim()
  .min(1, { error: en.validation.nameRequired })
  .max(80, { error: en.validation.nameTooLong });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: en.validation.passwordRequired }),
  next: z.string().optional(),
});

export const requestResetSchema = z.object({ email });

export const updatePasswordSchema = z.object({
  tokenHash: z.string().min(1, { error: en.auth.errors.invalidLink }),
  password,
});

export const acceptInviteSchema = z.object({
  invitation: z.string().min(1, { error: en.auth.errors.invalidLink }),
  tokenHash: z.string().min(1, { error: en.auth.errors.invalidLink }),
  displayName,
  password,
});

export const emailSchema = email;

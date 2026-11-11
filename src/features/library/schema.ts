import { z } from "zod";

import { en } from "@/messages/en";

const name = z
  .string()
  .trim()
  .min(1, { error: en.validation.nameRequired })
  .max(120, { error: en.validation.nameTooLong });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value));

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    error: en.validation.email,
  })
  .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\/\S+$/.test(value), { error: en.validation.url })
  .transform((value) => (value === "" ? null : value));

export const brandValues = z.object({
  name,
  description: optionalText(2000),
  industry: optionalText(120),
  tone: optionalText(2000),
  target_audience: optionalText(2000),
  no_gos: optionalText(2000),
  website: optionalUrl,
});

export const clientValues = z.object({
  name,
  email: optionalEmail,
  phone: optionalText(60),
  note: optionalText(2000),
});

export const saveBrandSchema = z.object({ id: z.uuid().nullable(), values: brandValues });
export const saveClientSchema = z.object({ id: z.uuid().nullable(), values: clientValues });
export const libraryIdSchema = z.object({ id: z.uuid() });

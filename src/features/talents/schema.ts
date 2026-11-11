import { z } from "zod";

import { libraryName, optionalText } from "@/features/library/schema";
import { en } from "@/messages/en";

export const TALENT_TYPES = ["person", "animal", "object"] as const;

const MAX_LIST_ENTRIES = 30;

// "English, German" -> ["English", "German"]; duplicates and blanks dropped.
const commaList = z
  .string()
  .max(2000, { error: en.validation.tooLong })
  .transform((value) => [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ])
  .refine((entries) => entries.length <= MAX_LIST_ENTRIES, { error: en.talents.errors.tooMany })
  .refine((entries) => entries.every((entry) => entry.length <= 60), { error: en.validation.tooLong });

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isCalendarDate(value), { error: en.talents.errors.birthDate })
  .transform((value) => (value === "" ? null : value));

// "350" or "350.50" (a comma works as well) -> cents; empty -> null.
const optionalMoney = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,7}([.,]\d{1,2})?$/.test(value), {
    error: en.talents.errors.dayRate,
  })
  .transform((value) => (value === "" ? null : Math.round(Number(value.replace(",", ".")) * 100)));

export const talentValues = z.object({
  name: libraryName,
  // The form sends plain strings, so the input type stays `string`.
  type: z.string().pipe(z.enum(TALENT_TYPES, { error: en.talents.errors.type })),
  description: optionalText(2000),
  birth_date: optionalDate,
  languages: commaList,
  residence: optionalText(120),
  contact: optionalText(500),
  day_rate: optionalMoney,
  tags: commaList,
});

export const saveTalentSchema = z.object({ id: z.uuid().nullable(), values: talentValues });
export const talentIdSchema = z.object({ id: z.uuid() });

// Cents as the form shows them: 35050 -> "350.50", 35000 -> "350".
export function formatDayRate(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

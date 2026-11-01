/**
 * features/auth/errors.ts — maps a failed login/register call to what the
 * form shows: one message above the form and/or messages per field.
 *
 * 422 field messages come from the server in English.
 * TODO(spec): localise them once problem `errors` carry a code, not just text.
 */
import { ApiError } from "../../api/problem";
import { t } from "../../i18n";

export interface FormErrors {
  form?: string;
  fields: Record<string, string>;
}

export function formErrors(err: unknown, overrides: Partial<Record<number, FormErrors>> = {}): FormErrors {
  if (!(err instanceof ApiError)) return { form: t("errors.network"), fields: {} };
  const override = overrides[err.status];
  if (override) return override;
  if (err.status === 422) return { fields: err.fieldErrors };
  if (err.status === 429) return { form: t("errors.rateLimited"), fields: {} };
  return { form: t("errors.generic"), fields: {} };
}

/**
 * i18n/index.ts — `t(key)` for every user-visible string (CLAUDE.md).
 *
 * Keys are the dot paths into en.json and are type-checked, so a typo or a
 * removed string fails `tsc` rather than showing a raw key. `{name}`
 * placeholders are filled from `vars`. English is the only catalogue so
 * far; identity already stores `de` as a user locale.
 * TODO(spec): add de.json and select the catalogue from the user's locale.
 */
import en from "./en.json";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every valid message key, e.g. "auth.login.title". */
export type MessageKey = Leaves<typeof en>;

function lookup(key: string): string {
  let node: unknown = en;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : key;
}

/** The English message for `key`, with `{placeholders}` replaced from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const msg = lookup(key);
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

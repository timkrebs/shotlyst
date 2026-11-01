/**
 * app/theme.ts — light/dark theme preference for plan mode.
 *
 * The preference is UI state, so it lives in Zustand and is persisted to
 * localStorage (it must apply before the session is known, e.g. on the
 * login page). "system" follows the OS setting. The resolved theme is a
 * `dark` class on <html>, which Tailwind's `dark:` variant keys on.
 * Shoot mode is always dark (docs/05) and will force the class itself.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ preference: "system", setPreference: (preference) => set({ preference }) }), {
    name: "shotlyst-theme",
  }),
);

const darkQuery = "(prefers-color-scheme: dark)";

/** Whether `preference` currently means dark, given the OS setting. */
export function isDark(preference: ThemePreference, systemDark: boolean): boolean {
  return preference === "dark" || (preference === "system" && systemDark);
}

/** Keeps the `dark` class on <html> in sync with the preference and the OS. */
export function useApplyTheme() {
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    const media = globalThis.matchMedia?.(darkQuery);
    const apply = () => {
      document.documentElement.classList.toggle("dark", isDark(preference, media?.matches ?? false));
    };
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [preference]);
}

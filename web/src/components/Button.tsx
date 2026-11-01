/**
 * components/Button.tsx — the app's button. "primary" is solid ink for the
 * one main action on a screen; "quiet" is for everything else. Pending
 * buttons stay focusable but ignore clicks and announce busy state.
 */
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet";
  pending?: boolean;
}

const styles = {
  primary: "bg-fg text-bg hover:opacity-90 px-4 py-2.5",
  quiet: "text-fg underline-offset-4 hover:underline px-2 py-1.5",
} as const;

export function Button({ variant = "primary", pending = false, className = "", onClick, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      aria-busy={pending || undefined}
      aria-disabled={pending || rest.disabled || undefined}
      onClick={pending ? (e) => e.preventDefault() : onClick}
      className={`inline-flex items-center justify-center rounded-sm text-sm font-medium transition-opacity disabled:opacity-50 aria-busy:opacity-70 ${styles[variant]} ${className}`}
    />
  );
}

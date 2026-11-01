/**
 * components/TextField.tsx — labelled input with hint and error text.
 *
 * Labels sit above the field in small caps, like a form in a notebook. The
 * error replaces the hint and is wired via aria-describedby/aria-invalid so
 * screen readers announce it with the field.
 */
import { useId, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export function TextField({ label, hint, error, className = "", ...input }: Props) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className="rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-muted focus:border-fg focus:outline-none aria-invalid:border-danger"
      />
      {note && (
        <p id={noteId} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

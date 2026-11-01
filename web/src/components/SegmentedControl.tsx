/**
 * components/SegmentedControl.tsx — pick one of a few options (docs/05
 * shared components). Built on native radio inputs so keyboard arrows,
 * focus and screen-reader semantics come from the browser.
 */
import { useId } from "react";

interface Props<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const name = useId();
  return (
    <fieldset className="inline-flex rounded-sm border border-line text-xs">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="cursor-pointer px-2.5 py-1 text-muted has-checked:bg-fg has-checked:text-bg has-focus-visible:outline-2 has-focus-visible:outline-fg"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

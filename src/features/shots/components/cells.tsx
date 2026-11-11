"use client";

import { ImageIcon, X } from "lucide-react";
import { memo, useRef, useState } from "react";

import { vocabOptions } from "@/lib/film/vocab";
import type { ShotColumn } from "@/lib/shots/columns";
import type { Shot } from "@/lib/shots/types";
import { useSignedUrl } from "@/lib/storage-client";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import type { TalentName } from "../queries";
import type { ShotListActions } from "../use-shot-list";

// Cells of the shot list. Every editable cell is a real form control, so Tab
// walks through them like a spreadsheet; `data-cell` lets Enter find the
// same column in the next row.

const control =
  "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-accent/50 focus:ring-2 focus:ring-inset focus:ring-ring/60 disabled:cursor-default disabled:opacity-100";

export const cellId = (shotId: string, columnKey: string) => `${shotId}:${columnKey}`;

function TextCell({
  id,
  label,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string | null;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      // Remount when the stored value changes, so the field shows it.
      key={value ?? ""}
      data-cell={id}
      aria-label={label}
      defaultValue={value ?? ""}
      disabled={disabled}
      className={control}
      onBlur={(event) => {
        if (event.target.value.trim() !== (value ?? "")) onCommit(event.target.value);
      }}
    />
  );
}

function NumberCell({
  id,
  label,
  value,
  max,
  disabled,
  onInput,
  onCommit,
}: {
  id: string;
  label: string;
  value: number | null;
  max: number;
  disabled: boolean;
  // Called on every keystroke, so totals follow while typing.
  onInput?: (value: number | null) => void;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const committed = useRef(value);
  const parse = (raw: string) => (raw === "" ? null : Math.min(max, Number(raw)));

  return (
    <input
      data-cell={id}
      aria-label={label}
      inputMode="numeric"
      value={text}
      disabled={disabled}
      className={cn(control, "text-right tabular-nums")}
      // Typing replaces the number, as in a spreadsheet.
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
        setText(digits);
        onInput?.(parse(digits));
      }}
      onBlur={() => {
        const next = parse(text);
        if (next !== committed.current) {
          committed.current = next;
          onCommit(next);
        }
      }}
    />
  );
}

function SelectCell({
  id,
  label,
  value,
  options,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  // A stored value that is not in the list any more stays selectable.
  const known = !value || options.some((option) => option.value === value);
  return (
    <select
      data-cell={id}
      aria-label={label}
      value={value ?? ""}
      disabled={disabled}
      className={cn(control, "appearance-none")}
      onChange={(event) => onCommit(event.target.value)}
    >
      <option value="" />
      {known ? null : <option value={value ?? ""}>{value}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CastCell({
  id,
  label,
  shot,
  talents,
  disabled,
  onAdd,
  onRemove,
}: {
  id: string;
  label: string;
  shot: Shot;
  talents: ReadonlyMap<string, TalentName>;
  disabled: boolean;
  onAdd: (name: string) => void;
  onRemove: (talentId: string) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const name = text.trim();
    setText("");
    if (name) onAdd(name);
  };

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 px-1 py-1">
      {shot.talent_ids.map((talentId) => (
        <span
          key={talentId}
          className="bg-secondary flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs whitespace-nowrap"
        >
          {talents.get(talentId)?.name ?? "…"}
          {disabled ? null : (
            <button
              type="button"
              tabIndex={-1}
              aria-label={en.shots.removeCast(talents.get(talentId)?.name ?? "")}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(talentId)}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {disabled ? null : (
        <input
          data-cell={id}
          aria-label={label}
          list="talent-names"
          value={text}
          placeholder={shot.talent_ids.length === 0 ? en.shots.castPlaceholder : ""}
          className="focus:ring-ring/60 h-7 min-w-16 flex-1 rounded bg-transparent px-1 text-sm outline-none focus:ring-2"
          onChange={(event) => setText(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === ",") && text.trim()) {
              // Enter with a name adds it; Enter on an empty field moves on.
              event.preventDefault();
              add();
            } else if (event.key === "Backspace" && text === "" && shot.talent_ids.length > 0) {
              onRemove(shot.talent_ids[shot.talent_ids.length - 1]);
            }
          }}
        />
      )}
    </div>
  );
}

export function FrameThumb({ path, className }: { path: string | null; className?: string }) {
  const url = useSignedUrl(path);
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn("size-full object-cover", className)} />
  ) : (
    <span className="bg-muted text-muted-foreground flex size-full items-center justify-center">
      <ImageIcon className="size-4" aria-hidden />
    </span>
  );
}

// One cell of the shot list for any column kind.
export const ShotCell = memo(function ShotCell({
  shot,
  column,
  number,
  talents,
  canEdit,
  store,
  onOpenFrames,
}: {
  shot: Shot;
  column: ShotColumn;
  number: string;
  talents: ReadonlyMap<string, TalentName>;
  canEdit: boolean;
  store: ShotListActions;
  onOpenFrames: (shotId: string) => void;
}) {
  const id = cellId(shot.id, column.key);
  const label = en.shots.cellLabel(column.label, number);
  const disabled = !canEdit;

  if (column.kind === "frame") {
    return (
      <button
        type="button"
        aria-label={en.shots.framesOf(number)}
        className="focus-visible:ring-ring/60 m-1 block h-10 w-16 overflow-hidden rounded outline-none focus-visible:ring-2"
        onClick={() => onOpenFrames(shot.id)}
      >
        <FrameThumb path={shot.frame_path} />
      </button>
    );
  }

  if (column.kind === "cast") {
    return (
      <CastCell
        id={id}
        label={label}
        shot={shot}
        talents={talents}
        disabled={disabled}
        onAdd={(name) => void store.addCastByName(shot.id, name)}
        onRemove={(talentId) => store.removeCastMember(shot.id, talentId)}
      />
    );
  }

  if (column.custom) {
    const value = shot.custom_values[column.key] ?? null;
    const commit = (next: string | number | boolean | null) =>
      store.saveShot(shot.id, { custom_values: { [column.key]: next } });
    if (column.kind === "checkbox") {
      return (
        <span className="flex h-9 items-center justify-center">
          <input
            type="checkbox"
            data-cell={id}
            aria-label={label}
            checked={value === true}
            disabled={disabled}
            className="size-4"
            onChange={(event) => commit(event.target.checked)}
          />
        </span>
      );
    }
    if (column.kind === "number") {
      return (
        <NumberCell
          id={id}
          label={label}
          value={typeof value === "number" ? value : null}
          max={999999}
          disabled={disabled}
          onCommit={commit}
        />
      );
    }
    if (column.kind === "select") {
      return (
        <SelectCell
          id={id}
          label={label}
          value={typeof value === "string" ? value : null}
          options={(column.options ?? []).map((option) => ({ value: option, label: option }))}
          disabled={disabled}
          onCommit={(next) => commit(next || null)}
        />
      );
    }
    return (
      <TextCell
        id={id}
        label={label}
        value={typeof value === "string" ? value : null}
        disabled={disabled}
        onCommit={(next) => commit(next.trim() || null)}
      />
    );
  }

  const field = column.field;
  if (!field) return null;

  if (field === "duration_sec" || field === "setup_min") {
    const isDuration = field === "duration_sec";
    return (
      <NumberCell
        id={id}
        label={label}
        value={shot[field]}
        max={isDuration ? 86400 : 1440}
        disabled={disabled}
        onInput={isDuration ? (next) => store.patchShot(shot.id, { duration_sec: next ?? 0 }) : undefined}
        onCommit={(next) =>
          store.saveShot(shot.id, isDuration ? { duration_sec: next ?? 0 } : { setup_min: next })
        }
      />
    );
  }

  if (column.kind === "select" && column.vocab) {
    return (
      <SelectCell
        id={id}
        label={label}
        value={shot[field]}
        options={vocabOptions(column.vocab)}
        disabled={disabled}
        onCommit={(next) => store.saveShot(shot.id, { [field]: next })}
      />
    );
  }

  return (
    <TextCell
      id={id}
      label={label}
      value={shot[field]}
      disabled={disabled}
      onCommit={(next) => store.saveShot(shot.id, { [field]: next })}
    />
  );
});

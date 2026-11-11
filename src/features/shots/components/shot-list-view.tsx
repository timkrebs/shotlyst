"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { ConfirmDialog } from "@/components/confirm-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatSeconds } from "@/lib/concepts/beats";
import { positionAt } from "@/lib/position";
import type { ShotColumn } from "@/lib/shots/columns";
import { orderShots, shotListTotals, shotNumbers, type SegmentTotal } from "@/lib/shots/totals";
import type { Segment, Shot } from "@/lib/shots/types";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import type { TalentName } from "../queries";
import type { ShotListActions, ShotListStore } from "../use-shot-list";
import { cellId, ShotCell } from "./cells";

const SEGMENT_PREFIX = "seg:";
const NUMBER_WIDTH = 96;
const WIDTHS: Record<ShotColumn["kind"], number> = {
  frame: 76,
  text: 220,
  select: 150,
  number: 96,
  checkbox: 90,
  cast: 220,
};
const columnWidth = (column: ShotColumn) => (column.key === "action" ? 300 : WIDTHS[column.kind]);

// While a segment is dragged only segments are targets. A dragged shot lands
// on the row under the pointer, or on the segment when no row is there.
const detectCollision: CollisionDetection = (args) => {
  const draggingSegment = String(args.active.id).startsWith(SEGMENT_PREFIX);
  const isSegment = (id: unknown) => String(id).startsWith(SEGMENT_PREFIX);
  if (draggingSegment) {
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => isSegment(container.id)),
    });
  }
  const under = pointerWithin(args);
  if (under.length === 0) return closestCorners(args);
  const rows = under.filter((hit) => !isSegment(hit.id));
  return rows.length > 0 ? rows : under;
};

const ShotRow = memo(function ShotRow({
  shot,
  number,
  columns,
  talents,
  canEdit,
  selected,
  store,
  onSelect,
  onOpenFrames,
}: {
  shot: Shot;
  number: string;
  columns: ShotColumn[];
  talents: ReadonlyMap<string, TalentName>;
  canEdit: boolean;
  selected: boolean;
  store: ShotListActions;
  onSelect: (shotId: string, selected: boolean) => void;
  onOpenFrames: (shotId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: shot.id, disabled: !canEdit });

  return (
    <tr
      ref={setNodeRef}
      data-testid="shot-row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("border-b", selected && "bg-accent/40", isDragging && "opacity-40")}
    >
      <td className="border-r">
        <span className="flex h-9 items-center gap-1 px-1">
          {canEdit ? (
            <>
              <button
                ref={setActivatorNodeRef}
                type="button"
                aria-label={en.shots.dragShot(number)}
                className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
                {...attributes}
                {...listeners}
                // Out of the Tab order, so Tab walks the cells only.
                tabIndex={-1}
              >
                <GripVertical className="size-4" />
              </button>
              <input
                type="checkbox"
                tabIndex={-1}
                aria-label={en.shots.selectShot(number)}
                checked={selected}
                className="size-4"
                onChange={(event) => onSelect(shot.id, event.target.checked)}
              />
            </>
          ) : null}
          <span className="ml-auto pr-1 text-sm tabular-nums">{number}</span>
        </span>
      </td>
      {columns.map((column) => (
        <td key={column.key} className="border-r p-0 align-middle last:border-r-0">
          <ShotCell
            shot={shot}
            column={column}
            number={number}
            talents={talents}
            canEdit={canEdit}
            store={store}
            onOpenFrames={onOpenFrames}
          />
        </td>
      ))}
    </tr>
  );
});

function SegmentBlock({
  segment,
  total,
  canEdit,
  canDelete,
  store,
  colgroup,
  width,
  onAddShot,
  children,
}: {
  segment: Segment;
  total: SegmentTotal | undefined;
  canEdit: boolean;
  canDelete: boolean;
  store: ShotListActions;
  colgroup: ReactNode;
  width: number;
  onAddShot: (segmentId: string) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: `${SEGMENT_PREFIX}${segment.id}`, disabled: !canEdit });
  const [confirming, setConfirming] = useState(false);

  const save = (title: string, target: string) => {
    const nextTitle = title.trim() || segment.title;
    const nextTarget = target.trim() === "" ? null : Math.min(86400, Number(target));
    if (nextTitle !== segment.title || nextTarget !== segment.target_duration_sec) {
      store.saveSegment(segment.id, nextTitle, nextTarget);
    }
  };

  return (
    <section
      ref={setNodeRef}
      aria-label={segment.title}
      data-testid="segment"
      style={{ transform: CSS.Translate.toString(transform), transition, width }}
      className={cn("border-b last:border-b-0", isDragging && "opacity-40", isOver && "bg-accent/20")}
    >
      <header className="bg-muted/60 flex h-11 items-center gap-2 border-b px-2">
        {canEdit ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={en.shots.dragSegment(segment.title)}
            className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        {canEdit ? (
          <>
            <Input
              key={`title-${segment.title}`}
              defaultValue={segment.title}
              aria-label={en.shots.segmentTitle}
              className="bg-background h-8 w-64 font-medium"
              maxLength={200}
              onBlur={(event) => save(event.target.value, String(segment.target_duration_sec ?? ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <label className="text-muted-foreground flex items-center gap-1 text-xs">
              {en.shots.target}
              <Input
                key={`target-${segment.target_duration_sec ?? ""}`}
                defaultValue={segment.target_duration_sec ?? ""}
                inputMode="numeric"
                aria-label={en.shots.targetOf(segment.title)}
                className="bg-background h-8 w-16 text-right tabular-nums"
                onBlur={(event) =>
                  save(segment.title, event.target.value.replace(/\D/g, "").slice(0, 5))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </>
        ) : (
          <h3 className="font-medium">{segment.title}</h3>
        )}
        <span
          data-testid="segment-total"
          data-over={total?.over ? "true" : "false"}
          className={cn(
            "rounded px-2 py-0.5 text-sm font-medium tabular-nums",
            total?.over
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
          )}
        >
          {formatSeconds(total?.totalSec ?? 0)}
          {total?.targetSec !== null && total?.targetSec !== undefined
            ? ` / ${formatSeconds(total.targetSec)}`
            : ""}
        </span>
        <span className="text-muted-foreground text-xs">{en.shots.shotCount(total?.shotCount ?? 0)}</span>
        {canEdit ? (
          <span className="ml-4 flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label={en.shots.addShotTo(segment.title)}
              onClick={() => onAddShot(segment.id)}
            >
              <Plus />
              {en.shots.addShot}
            </Button>
            {canDelete ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={en.common.deleteItem(segment.title)}
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </span>
        ) : null}
      </header>
      <table className="table-fixed border-collapse" style={{ width }}>
        {colgroup}
        <tbody>{children}</tbody>
      </table>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={en.shots.deleteSegmentTitle(segment.title)}
        description={en.shots.deleteSegmentDescription}
        confirmLabel={en.common.delete}
        onConfirm={() => {
          store.removeSegment(segment.id);
          setConfirming(false);
        }}
      />
    </section>
  );
}

// The shot list: one row per shot, grouped by segment, edited in place.
export function ShotListView({
  store,
  columns,
  talents,
  canEdit,
  onOpenFrames,
}: {
  store: ShotListStore;
  columns: ShotColumn[];
  talents: ReadonlyMap<string, TalentName>;
  canEdit: boolean;
  onOpenFrames: (shotId: string) => void;
}) {
  const { segments, shots, actions } = store;
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSegment, setNewSegment] = useState("");

  const ordered = useMemo(() => orderShots(segments, shots), [segments, shots]);
  const numbers = useMemo(() => shotNumbers(segments, shots), [segments, shots]);
  const totals = useMemo(() => shotListTotals(segments, shots), [segments, shots]);
  const selected = ordered.filter((shot) => selection.has(shot.id)).map((shot) => shot.id);

  // The column model: header labels and widths come from one definition.
  const columnDefs = useMemo<ColumnDef<Shot>[]>(
    () => [
      { id: "number", header: en.shotColumns.number, size: NUMBER_WIDTH },
      ...columns.map((column) => ({
        id: column.key,
        header: column.label,
        size: columnWidth(column),
      })),
    ],
    [columns],
  );
  // The table instance is used in this component only, never passed on.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: ordered,
    columns: columnDefs,
    getRowId: (shot) => shot.id,
    getCoreRowModel: getCoreRowModel(),
  });
  const width = table.getTotalSize();
  const colgroup = (
    <colgroup>
      {table.getVisibleLeafColumns().map((column) => (
        <col key={column.id} style={{ width: column.getSize() }} />
      ))}
    </colgroup>
  );
  const rows = table.getRowModel().rows;

  // Focus a cell once it exists, e.g. in a row that was just added.
  useEffect(() => {
    if (!pendingFocus) return;
    const element = document.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`);
    if (element) {
      element.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, shots]);

  const onSelect = useMemo(
    () => (shotId: string, checked: boolean) =>
      setSelection((current) => {
        const next = new Set(current);
        if (checked) next.add(shotId);
        else next.delete(shotId);
        return next;
      }),
    [],
  );

  // Enter moves down a row in the same column; in the last row of a segment
  // it adds a shot.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const cell = target.dataset.cell;
    if (!cell || target.tagName === "SELECT") return;
    event.preventDefault();
    const [shotId, columnKey] = cell.split(":");
    const index = ordered.findIndex((shot) => shot.id === shotId);
    if (index === -1) return;
    // Leaving the field commits its value.
    target.blur();
    const next = ordered[index + 1];
    if (next && next.segment_id === ordered[index].segment_id) {
      setPendingFocus(cellId(next.id, columnKey));
    } else if (canEdit) {
      setPendingFocus(cellId(actions.addShot(ordered[index].segment_id, shotId), columnKey));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overShot = ordered.find((shot) => shot.id === overId);
    const targetSegmentId = overId.startsWith(SEGMENT_PREFIX)
      ? overId.slice(SEGMENT_PREFIX.length)
      : overShot?.segment_id;
    if (!targetSegmentId) return;

    if (activeId.startsWith(SEGMENT_PREFIX)) {
      const segmentId = activeId.slice(SEGMENT_PREFIX.length);
      if (segmentId === targetSegmentId) return;
      const others = segments.filter((segment) => segment.id !== segmentId);
      let index = others.findIndex((segment) => segment.id === targetSegmentId);
      const from = segments.findIndex((segment) => segment.id === segmentId);
      const to = segments.findIndex((segment) => segment.id === targetSegmentId);
      if (from < to) index += 1;
      actions.reorderSegment(
        segmentId,
        positionAt(
          others.map((segment) => segment.position),
          index,
        ),
      );
      return;
    }

    const shot = ordered.find((candidate) => candidate.id === activeId);
    if (!shot) return;
    const column = ordered.filter((candidate) => candidate.segment_id === targetSegmentId);
    const others = column.filter((candidate) => candidate.id !== shot.id);
    let index = others.length;
    if (overShot && overShot.id !== shot.id) {
      index = others.findIndex((candidate) => candidate.id === overShot.id);
      const from = column.findIndex((candidate) => candidate.id === shot.id);
      const to = column.findIndex((candidate) => candidate.id === overShot.id);
      if (from !== -1 && from < to) index += 1;
    } else if (overShot) {
      return;
    }
    if (shot.segment_id === targetSegmentId && column.indexOf(shot) === index) return;
    actions.moveShot(
      shot.id,
      targetSegmentId,
      positionAt(
        others.map((candidate) => candidate.position),
        index,
      ),
    );
  }

  const draggingShot = ordered.find((shot) => shot.id === draggingId);
  const draggingSegment = draggingId?.startsWith(SEGMENT_PREFIX)
    ? segments.find((segment) => `${SEGMENT_PREFIX}${segment.id}` === draggingId)
    : undefined;

  return (
    <div className="grid gap-3">
      {canEdit && selected.length > 0 ? (
        <div
          role="toolbar"
          aria-label={en.shots.selectionTools}
          className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
        >
          <span className="font-medium">{en.shots.selected(selected.length)}</span>
          <NativeSelect
            aria-label={en.shots.moveToSegment}
            className="h-8 w-52"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              actions.moveShotsToSegment(selected, event.target.value);
              setSelection(new Set());
            }}
          >
            <option value="">{en.shots.moveToSegment}</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.title}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void actions.copyShots(selected);
              setSelection(new Set());
            }}
          >
            {en.shots.duplicate}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
            {en.common.delete}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelection(new Set())}>
            {en.shots.clearSelection}
          </Button>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={detectCollision}
        onDragStart={({ active }) => setDraggingId(String(active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={onDragEnd}
      >
        <div
          className="overflow-x-auto rounded-lg border"
          data-testid="shot-list"
          onKeyDown={onKeyDown}
        >
          <table className="table-fixed border-collapse" style={{ width }}>
            {colgroup}
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="bg-muted border-b">
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="border-r px-2 py-2 text-left text-xs font-medium last:border-r-0"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
          </table>
          <SortableContext
            items={segments.map((segment) => `${SEGMENT_PREFIX}${segment.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {segments.map((segment) => {
              const segmentRows = rows.filter((row) => row.original.segment_id === segment.id);
              return (
                <SegmentBlock
                  key={segment.id}
                  segment={segment}
                  total={totals.segments.get(segment.id)}
                  canEdit={canEdit}
                  canDelete={segments.length > 1}
                  store={actions}
                  colgroup={colgroup}
                  width={width}
                  onAddShot={(segmentId) => {
                    // Put the cursor into the new row, ready to type.
                    const shotId = actions.addShot(segmentId);
                    const first = columns.find((column) => column.kind === "text");
                    if (first) setPendingFocus(cellId(shotId, first.key));
                  }}
                >
                  <SortableContext
                    items={segmentRows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {segmentRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
                          className="text-muted-foreground px-3 py-3 text-sm"
                        >
                          {en.shots.emptySegment}
                        </td>
                      </tr>
                    ) : (
                      segmentRows.map((row) => (
                        <ShotRow
                          key={row.id}
                          shot={row.original}
                          number={numbers.get(row.id) ?? ""}
                          columns={columns}
                          talents={talents}
                          canEdit={canEdit}
                          selected={selection.has(row.id)}
                          store={actions}
                          onSelect={onSelect}
                          onOpenFrames={onOpenFrames}
                        />
                      ))
                    )}
                  </SortableContext>
                </SegmentBlock>
              );
            })}
          </SortableContext>
        </div>
        <DragOverlay>
          {draggingShot || draggingSegment ? (
            <div className="bg-card w-fit rounded-md border px-3 py-2 text-sm shadow-lg">
              {draggingSegment
                ? draggingSegment.title
                : en.shots.shotLabel(
                    numbers.get(draggingShot?.id ?? "") ?? "",
                    draggingShot?.action ?? "",
                  )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newSegment.trim()) return;
            actions.addSegment(newSegment.trim());
            setNewSegment("");
          }}
        >
          <Input
            value={newSegment}
            onChange={(event) => setNewSegment(event.target.value)}
            placeholder={en.shots.newSegment}
            aria-label={en.shots.newSegment}
            className="h-8 w-56"
            maxLength={200}
          />
          <Button type="submit" variant="outline" size="sm">
            {en.shots.addSegment}
          </Button>
        </form>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={en.shots.deleteShotsTitle(selected.length)}
        description={en.shots.deleteShotsDescription}
        confirmLabel={en.common.delete}
        onConfirm={() => {
          actions.removeShots(selected);
          setSelection(new Set());
          setConfirmDelete(false);
        }}
      />
      <datalist id="talent-names">
        {[...talents.values()].map((talent) => (
          <option key={talent.id} value={talent.name} />
        ))}
      </datalist>
    </div>
  );
}

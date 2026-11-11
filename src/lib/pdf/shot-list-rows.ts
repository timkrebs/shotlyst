import { cellText, type ShotColumn } from "@/lib/shots/columns";
import { shotListTotals, shotNumbers, type SegmentTotal, type ShotListTotals } from "@/lib/shots/totals";
import type { Segment, Shot, ShotList } from "@/lib/shots/types";
import { en } from "@/messages/en";

// The shot list as the exports print it: segments in running order, each
// with its totals and its shots. Built from the same columns and totals as
// the screen view. Pure.

export interface ShotListRow {
  shot: Shot;
  number: string;
  // One text per column, in column order; empty for the frame column.
  cells: string[];
}

export interface ShotListSection {
  segment: Segment;
  total: SegmentTotal;
  rows: ShotListRow[];
}

export interface ShotListExport {
  sections: ShotListSection[];
  totals: ShotListTotals;
}

export function shotListExport(
  list: ShotList,
  columns: ShotColumn[],
  talentNames: ReadonlyMap<string, string>,
): ShotListExport {
  const totals = shotListTotals(list.segments, list.shots);
  const numbers = shotNumbers(list.segments, list.shots);
  const sections = list.segments.flatMap((segment) => {
    const total = totals.segments.get(segment.id);
    if (!total) return [];
    const rows = list.shots
      .filter((shot) => shot.segment_id === segment.id)
      .map((shot) => ({
        shot,
        number: numbers.get(shot.id) ?? "",
        cells: columns.map((column) => cellText(shot, column, talentNames)),
      }));
    return [{ segment, total, rows }];
  });
  return { sections, totals };
}

// Header row, then one row per shot: segment, shot number, the columns.
// Frames are images and have no place in a CSV.
export function shotListCsvRows(data: ShotListExport, columns: ShotColumn[]): string[][] {
  const kept = columns.flatMap((column, index) => (column.kind === "frame" ? [] : [index]));
  return [
    [en.exports.segmentColumn, en.shotColumns.number, ...kept.map((index) => columns[index].label)],
    ...data.sections.flatMap((section) =>
      section.rows.map((row) => [
        section.segment.title,
        row.number,
        ...kept.map((index) => row.cells[index]),
      ]),
    ),
  ];
}

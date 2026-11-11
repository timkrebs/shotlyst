import "server-only";

import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatSeconds } from "@/lib/concepts/beats";
import { parseAspectRatio } from "@/lib/shots/aspect";
import type { ShotColumn } from "@/lib/shots/columns";
import { en } from "@/messages/en";

import type { PdfImage } from "./files";
import { COLORS, contentBox, ExportPage, FONT, PdfPicture, renderPdf, type PageFrame } from "./layout";
import type { ShotListExport } from "./shot-list-rows";

// The shot list on landscape A4: the columns of the screen view, grouped by
// segment, with each segment's runtime against its target.

const NUMBER_WEIGHT = 1;
const CELL_PADDING = 3;

const styles = StyleSheet.create({
  project: { fontFamily: FONT.bold, fontSize: 13 },
  creative: { fontSize: 10, marginTop: 2 },
  runtime: { fontSize: 9, marginTop: 2, marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  headRow: {
    flexDirection: "row",
    backgroundColor: COLORS.shade,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
  },
  headCell: { fontFamily: FONT.bold, fontSize: 6.5, padding: CELL_PADDING },
  cell: { fontSize: 7, padding: CELL_PADDING },
  segment: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: CELL_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.text,
  },
  segmentTitle: { fontFamily: FONT.bold, fontSize: 9, flex: 1 },
  segmentTotals: { fontSize: 8, marginLeft: 12 },
  empty: { fontSize: 7, color: COLORS.muted, padding: CELL_PADDING },
});

// "0:25 of 0:20 target", the first part red when over target, green otherwise.
function Runtime({ totalSec, targetSec, over }: { totalSec: number; targetSec: number | null; over: boolean }) {
  return (
    <>
      <Text style={{ fontFamily: FONT.bold, color: over ? COLORS.over : COLORS.within }}>
        {formatSeconds(totalSec)}
      </Text>
      {targetSec !== null ? ` ${en.exports.ofTarget(formatSeconds(targetSec))}` : ""}
    </>
  );
}

export interface ShotListPdfInput {
  frame: PageFrame;
  project: { name: string; project_number: string };
  creativeTitle: string;
  aspectRatio: string;
  columns: ShotColumn[];
  data: ShotListExport;
  // Active frames by storage path.
  images: ReadonlyMap<string, PdfImage>;
}

export function renderShotListPdf(input: ShotListPdfInput) {
  const { frame, project, creativeTitle, columns, data, images } = input;
  const box = contentBox("landscape");
  const totalWeight = NUMBER_WEIGHT + columns.reduce((sum, column) => sum + column.weight, 0);
  const widthOf = (weight: number) => (box.width * weight) / totalWeight;
  const ratio = parseAspectRatio(input.aspectRatio);

  return renderPdf(
    `${project.name} – ${creativeTitle} – ${en.exports.shotList}`,
    <ExportPage frame={frame} orientation="landscape">
      <Text style={styles.project}>
        {project.name} · {project.project_number}
      </Text>
      <Text style={styles.creative}>{creativeTitle}</Text>
      <Text style={styles.runtime}>
        {en.exports.runtime}: <Runtime {...data.totals} /> · {en.exports.shotCount(data.totals.shotCount)}
      </Text>

      <View style={styles.headRow} fixed>
        <Text style={[styles.headCell, { width: widthOf(NUMBER_WEIGHT) }]}>{en.shotColumns.number}</Text>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.headCell, { width: widthOf(column.weight) }]}>
            {column.label}
          </Text>
        ))}
      </View>

      {data.sections.map(({ segment, total, rows }) => (
        <View key={segment.id}>
          <View style={styles.segment} wrap={false} minPresenceAhead={30}>
            <Text style={styles.segmentTitle}>{segment.title}</Text>
            <Text style={styles.segmentTotals}>
              {en.exports.shotCount(total.shotCount)} · <Runtime {...total} />
            </Text>
          </View>
          {rows.length === 0 ? <Text style={styles.empty}>{en.exports.noShots}</Text> : null}
          {rows.map((row) => (
            <View key={row.shot.id} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { width: widthOf(NUMBER_WEIGHT) }]}>{row.number}</Text>
              {columns.map((column, index) => {
                const width = widthOf(column.weight);
                if (column.kind !== "frame") {
                  return (
                    <Text key={column.key} style={[styles.cell, { width }]}>
                      {row.cells[index]}
                    </Text>
                  );
                }
                const image = row.shot.frame_path ? images.get(row.shot.frame_path) : undefined;
                const inner = width - 2 * CELL_PADDING;
                return (
                  <View key={column.key} style={{ width, padding: CELL_PADDING }}>
                    {image ? (
                      <PdfPicture image={image} width={inner} height={inner / ratio} cover />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </ExportPage>,
  );
}

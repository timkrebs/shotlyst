import "server-only";

import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatSeconds } from "@/lib/concepts/beats";
import { vocabLabel } from "@/lib/film/vocab";
import { parseAspectRatio } from "@/lib/shots/aspect";
import type { Shot } from "@/lib/shots/types";
import { en } from "@/messages/en";

import { fitInside, type PdfImage } from "./files";
import { COLORS, contentBox, ExportPage, FONT, PdfPicture, renderPdf, type PageFrame } from "./layout";

// The storyboard on landscape A4: three cards per row, two to four rows per
// page, every frame in the film's aspect ratio.

export const STORYBOARD_SIZES = [6, 9, 12] as const;
export type StoryboardSize = (typeof STORYBOARD_SIZES)[number];

const COLUMNS = 3;
const GAP = 10;
const TITLE_HEIGHT = 22;
// Room under each frame for the shot's line and its action.
const TEXT_HEIGHT: Record<StoryboardSize, number> = { 6: 50, 9: 38, 12: 30 };
const ACTION_LINES: Record<StoryboardSize, number> = { 6: 4, 9: 2, 12: 2 };

const styles = StyleSheet.create({
  title: { height: TITLE_HEIGHT, fontFamily: FONT.bold, fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  frame: { alignItems: "center", justifyContent: "flex-end" },
  placeholder: {
    backgroundColor: COLORS.shade,
    borderWidth: 0.5,
    borderColor: COLORS.line,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: 7, color: COLORS.muted },
  meta: { fontFamily: FONT.bold, fontSize: 7.5, marginTop: 3 },
  action: { fontSize: 7, marginTop: 1 },
  empty: { fontSize: 9, color: COLORS.muted },
});

export interface StoryboardPdfInput {
  frame: PageFrame;
  project: { name: string; project_number: string };
  creativeTitle: string;
  aspectRatio: string;
  perPage: StoryboardSize;
  // Shots in running order.
  shots: Shot[];
  numbers: ReadonlyMap<string, string>;
  images: ReadonlyMap<string, PdfImage>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function renderStoryboardPdf(input: StoryboardPdfInput) {
  const { frame, project, creativeTitle, perPage, shots, numbers, images } = input;
  const box = contentBox("landscape");
  const rows = perPage / COLUMNS;
  const cell = {
    width: (box.width - (COLUMNS - 1) * GAP) / COLUMNS,
    // A little slack keeps rounding from pushing a row onto the next page.
    height: (box.height - TITLE_HEIGHT - (rows - 1) * GAP - 4) / rows,
  };
  const picture = fitInside(
    parseAspectRatio(input.aspectRatio),
    1,
    cell.width,
    cell.height - TEXT_HEIGHT[perPage],
  );
  const heading = `${project.name} · ${project.project_number} · ${creativeTitle}`;
  const pages = shots.length > 0 ? chunk(shots, perPage) : [[]];

  return renderPdf(
    `${project.name} – ${creativeTitle} – ${en.exports.storyboard}`,
    pages.map((page, pageIndex) => (
      <ExportPage key={pageIndex} frame={frame} orientation="landscape">
        <Text style={styles.title}>{heading}</Text>
        {page.length === 0 ? <Text style={styles.empty}>{en.exports.noShotsAtAll}</Text> : null}
        <View style={styles.grid} wrap={false}>
          {page.map((shot, index) => {
            const image = shot.frame_path ? images.get(shot.frame_path) : undefined;
            const meta = [
              numbers.get(shot.id) ?? "",
              vocabLabel("shotSize", shot.shot_size),
              formatSeconds(shot.duration_sec),
            ].filter(Boolean);
            return (
              <View
                key={shot.id}
                style={{
                  width: cell.width,
                  height: cell.height,
                  marginRight: index % COLUMNS === COLUMNS - 1 ? 0 : GAP,
                  marginBottom: index >= page.length - (page.length % COLUMNS || COLUMNS) ? 0 : GAP,
                }}
              >
                <View style={[styles.frame, { height: cell.height - TEXT_HEIGHT[perPage] }]}>
                  {image ? (
                    <PdfPicture image={image} width={picture.width} height={picture.height} cover />
                  ) : (
                    <View style={[styles.placeholder, picture]}>
                      <Text style={styles.placeholderText}>{en.exports.noFrame}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>{meta.join(" · ")}</Text>
                <Text
                  style={[styles.action, { maxLines: ACTION_LINES[perPage], textOverflow: "ellipsis" }]}
                >
                  {shot.action ?? ""}
                </Text>
              </View>
            );
          })}
        </View>
      </ExportPage>
    )),
  );
}

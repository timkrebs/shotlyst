import "server-only";

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { analyzeBeats, formatSeconds } from "@/lib/concepts/beats";
import { en } from "@/messages/en";

import { fitInside, type PdfImage } from "./files";
import { COLORS, contentBox, ExportPage, FONT, PdfPicture, renderPdf, type PageFrame } from "./layout";
import type { Block, Span } from "./tiptap";

// A concept on portrait A4: the written document, then its beats.

const MAX_IMAGE_HEIGHT = 300;

const styles = StyleSheet.create({
  project: { fontSize: 9, color: COLORS.muted },
  title: { fontFamily: FONT.bold, fontSize: 18, marginTop: 2, marginBottom: 12 },
  paragraph: { fontSize: 10, lineHeight: 1.4, marginBottom: 6 },
  h1: { fontFamily: FONT.bold, fontSize: 15, marginTop: 8, marginBottom: 6 },
  h2: { fontFamily: FONT.bold, fontSize: 13, marginTop: 6, marginBottom: 5 },
  h3: { fontFamily: FONT.bold, fontSize: 11, marginTop: 4, marginBottom: 4 },
  listItem: { flexDirection: "row" },
  marker: { width: 16, fontSize: 10, lineHeight: 1.4 },
  itemBody: { flex: 1 },
  checkbox: {
    width: 8,
    height: 8,
    marginTop: 2,
    marginRight: 8,
    borderWidth: 0.8,
    borderColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { width: 4, height: 4, backgroundColor: COLORS.text },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.line,
    paddingLeft: 10,
    marginBottom: 6,
    color: COLORS.muted,
  },
  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: COLORS.line, marginBottom: 8 },
  tableRow: { flexDirection: "row" },
  tableCell: {
    flex: 1,
    padding: 4,
    paddingBottom: 0,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: COLORS.line,
  },
  rule: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line, marginVertical: 8 },
  image: { marginBottom: 8 },
  beatsTitle: {
    fontFamily: FONT.bold,
    fontSize: 13,
    marginTop: 14,
    marginBottom: 8,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
  },
  issue: { fontSize: 8, color: COLORS.over, marginBottom: 2 },
  beat: { marginTop: 8 },
  beatHead: { flexDirection: "row" },
  beatTime: { width: 78, fontSize: 9, color: COLORS.muted },
  beatTitle: { flex: 1, fontFamily: FONT.bold, fontSize: 10 },
  beatBody: { marginLeft: 78, marginTop: 2 },
  beatDescription: { fontSize: 9, lineHeight: 1.4, marginBottom: 3 },
  beatItem: { flexDirection: "row", marginTop: 2 },
  beatItemLabel: { flex: 1, fontSize: 9 },
});

function fontOf(span: Span): string | undefined {
  if (span.bold && span.italic) return FONT.boldItalic;
  if (span.bold) return FONT.bold;
  if (span.italic) return FONT.italic;
  return undefined;
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, index) => {
    const fontFamily = fontOf(span);
    return fontFamily ? (
      <Text key={index} style={{ fontFamily }}>
        {span.text}
      </Text>
    ) : (
      span.text
    );
  });
}

function Checkbox({ checked }: { checked: boolean }) {
  return <View style={styles.checkbox}>{checked ? <View style={styles.checkboxMark} /> : null}</View>;
}

function Blocks({
  blocks,
  images,
  maxWidth,
}: {
  blocks: Block[];
  images: ReadonlyMap<string, PdfImage>;
  // Room for an image at this nesting depth.
  maxWidth: number;
}): ReactNode {
  return blocks.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return (
          <Text key={index} style={styles.paragraph}>
            <Spans spans={block.spans} />
          </Text>
        );
      case "heading":
        return (
          <Text
            key={index}
            style={block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3}
            minPresenceAhead={30}
          >
            <Spans spans={block.spans} />
          </Text>
        );
      case "list":
        return (
          <View key={index}>
            {block.items.map((item, position) => (
              <View key={position} style={styles.listItem}>
                {item.checked !== null ? (
                  <Checkbox checked={item.checked} />
                ) : (
                  <Text style={styles.marker}>
                    {block.ordered ? `${block.start + position}.` : "•"}
                  </Text>
                )}
                <View style={styles.itemBody}>
                  <Blocks blocks={item.blocks} images={images} maxWidth={maxWidth - 16} />
                </View>
              </View>
            ))}
          </View>
        );
      case "quote":
        return (
          <View key={index} style={styles.quote}>
            <Blocks blocks={block.blocks} images={images} maxWidth={maxWidth - 12} />
          </View>
        );
      case "table": {
        const columns = Math.max(...block.rows.map((row) => row.length));
        return (
          <View key={index} style={styles.table}>
            {block.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow} wrap={false}>
                {row.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    style={[
                      styles.tableCell,
                      cell.header ? { backgroundColor: COLORS.shade, fontFamily: FONT.bold } : {},
                    ]}
                  >
                    <Blocks blocks={cell.blocks} images={images} maxWidth={maxWidth / columns - 10} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      }
      case "rule":
        return <View key={index} style={styles.rule} />;
      case "image": {
        const image = images.get(block.path);
        if (!image) return null;
        // Shrink to fit; never enlarge.
        const size = fitInside(
          image.width,
          image.height,
          Math.min(maxWidth, image.width),
          Math.min(MAX_IMAGE_HEIGHT, image.height),
        );
        return (
          <View key={index} style={styles.image} wrap={false}>
            <PdfPicture image={image} width={size.width} height={size.height} />
          </View>
        );
      }
      case "pdf":
        return (
          <Text key={index} style={[styles.paragraph, { color: COLORS.muted }]}>
            {en.exports.attachedPdf(block.name)}
          </Text>
        );
    }
  });
}

export interface ConceptBeat {
  id: string;
  title: string;
  description: string | null;
  startSec: number;
  endSec: number;
  items: { id: string; label: string; done: boolean }[];
}

export interface ConceptPdfInput {
  frame: PageFrame;
  project: { name: string; project_number: string };
  title: string;
  blocks: Block[];
  beats: ConceptBeat[];
  images: ReadonlyMap<string, PdfImage>;
}

export function renderConceptPdf(input: ConceptPdfInput) {
  const { frame, project, title, blocks, beats, images } = input;
  const box = contentBox("portrait");
  const beatTitles = new Map(beats.map((beat) => [beat.id, beat.title]));
  const { issues } = analyzeBeats(beats);

  return renderPdf(
    `${project.name} – ${title}`,
    <ExportPage frame={frame} orientation="portrait">
      <Text style={styles.project}>
        {project.name} · {project.project_number}
      </Text>
      <Text style={styles.title}>{title}</Text>
      <Blocks blocks={blocks} images={images} maxWidth={box.width} />

      {beats.length > 0 ? (
        <View>
          <Text style={styles.beatsTitle} minPresenceAhead={40}>
            {en.exports.beats}
          </Text>
          {issues.map((issue, index) => (
            <Text key={index} style={styles.issue}>
              {en.concepts.beats[issue.kind](
                formatSeconds(issue.seconds),
                beatTitles.get(issue.beforeId) ?? "",
                beatTitles.get(issue.afterId) ?? "",
              )}
            </Text>
          ))}
          {beats.map((beat) => (
            <View key={beat.id} style={styles.beat} wrap={false}>
              <View style={styles.beatHead}>
                <Text style={styles.beatTime}>
                  {formatSeconds(beat.startSec)} – {formatSeconds(beat.endSec)}
                </Text>
                <Text style={styles.beatTitle}>{beat.title}</Text>
              </View>
              <View style={styles.beatBody}>
                {beat.description ? (
                  <Text style={styles.beatDescription}>{beat.description}</Text>
                ) : null}
                {beat.items.map((item) => (
                  <View key={item.id} style={styles.beatItem}>
                    <Checkbox checked={item.done} />
                    <Text style={styles.beatItemLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ExportPage>,
  );
}

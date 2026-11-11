import "server-only";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import { en } from "@/messages/en";

import { fitInside, type PdfImage } from "./files";

// The frame every PDF export shares: page size and margins, the header with
// logo and company line, the footer with page numbers and the export date.

// Words are never split with a hyphen: names and numbers must stay searchable.
Font.registerHyphenationCallback((word) => [word]);

// A4 in points.
const A4 = { short: 595.28, long: 841.89 };
export const PAGE_MARGIN = 28;
const HEADER_HEIGHT = 24;
const HEADER_GAP = 10;
const FOOTER_HEIGHT = 22;

export const COLORS = {
  text: "#18181b",
  muted: "#71717a",
  line: "#d4d4d8",
  shade: "#f4f4f5",
  over: "#dc2626",
  within: "#15803d",
};

export const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
};

export type Orientation = "portrait" | "landscape";

// The area inside the margins, below the header and above the footer.
export function contentBox(orientation: Orientation) {
  const width = orientation === "landscape" ? A4.long : A4.short;
  const height = orientation === "landscape" ? A4.short : A4.long;
  return {
    width: width - 2 * PAGE_MARGIN,
    height: height - 2 * PAGE_MARGIN - HEADER_HEIGHT - HEADER_GAP - FOOTER_HEIGHT,
  };
}

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN,
    paddingHorizontal: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + FOOTER_HEIGHT,
    fontFamily: FONT.regular,
    fontSize: 9,
    color: COLORS.text,
  },
  header: {
    height: HEADER_HEIGHT,
    marginBottom: HEADER_GAP,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingBottom: 4,
  },
  company: { flex: 1, fontSize: 8, color: COLORS.muted },
  label: { fontSize: 8, color: COLORS.muted, marginLeft: 8 },
  footer: {
    position: "absolute",
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    bottom: PAGE_MARGIN - 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.muted,
  },
});

export interface PageFrame {
  company: string | null;
  logo: PdfImage | null;
  // Shown at the right of the header, for example "Shot list".
  label: string;
  // Already formatted, in UTC.
  exportedAt: string;
}

// An image as the renderer takes it, at the given size.
export function PdfPicture({
  image,
  width,
  height,
  cover,
}: {
  image: PdfImage;
  width: number;
  height: number;
  cover?: boolean;
}) {
  return (
    // A PDF image takes no alt text; the rule is meant for HTML.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      src={{ data: image.data, format: image.format }}
      style={{ width, height, objectFit: cover ? "cover" : "contain" }}
    />
  );
}

export function ExportPage({
  frame,
  orientation,
  children,
}: {
  frame: PageFrame;
  orientation: Orientation;
  children: ReactNode;
}) {
  const logo = frame.logo
    ? fitInside(frame.logo.width, frame.logo.height, 120, HEADER_HEIGHT - 6)
    : null;
  return (
    <Page size="A4" orientation={orientation} style={styles.page}>
      <View style={styles.header} fixed>
        {frame.logo && logo ? (
          <View style={{ marginRight: 8 }}>
            <PdfPicture image={frame.logo} width={logo.width} height={logo.height} />
          </View>
        ) : null}
        <Text style={styles.company}>{frame.company ?? ""}</Text>
        <Text style={styles.label}>{frame.label}</Text>
      </View>
      {children}
      <View style={styles.footer} fixed>
        <Text>{en.exports.exported(frame.exportedAt)}</Text>
        <Text render={({ pageNumber, totalPages }) => en.exports.page(pageNumber, totalPages)} />
      </View>
    </Page>
  );
}

// Renders pages into the bytes of a PDF file.
export async function renderPdf(title: string, pages: ReactNode): Promise<Uint8Array<ArrayBuffer>> {
  const document: ReactElement<DocumentProps> = (
    <Document title={title} creator={en.app.name} producer={en.app.name}>
      {pages}
    </Document>
  );
  return new Uint8Array(await renderToBuffer(document));
}

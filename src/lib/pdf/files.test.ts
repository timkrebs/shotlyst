import { describe, expect, it } from "vitest";

import { exportFilename, fitInside, readPdfImage, slugify } from "./files";

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Start of a JPEG: SOI, an APP0 segment, then a baseline frame header for
// an image 300 wide and 200 high.
const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0x01, 0x11,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
]);

describe("readPdfImage", () => {
  it("reads the size of a PNG", () => {
    const image = readPdfImage(PNG);
    expect(image).toMatchObject({ format: "png", width: 1, height: 1 });
    expect(image?.data.equals(PNG)).toBe(true);
  });

  it("reads the size of a JPEG from its frame header", () => {
    expect(readPdfImage(JPEG)).toMatchObject({ format: "jpg", width: 300, height: 200 });
  });

  it("rejects formats the PDF renderer cannot draw", () => {
    const webp = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1");
    expect(readPdfImage(webp)).toBeNull();
    expect(readPdfImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(readPdfImage(new Uint8Array())).toBeNull();
  });

  it("rejects a JPEG that ends before its frame header", () => {
    expect(readPdfImage(JPEG.slice(0, 20))).toBeNull();
  });
});

describe("fitInside", () => {
  it("is limited by the width of a wide box and the height of a tall one", () => {
    expect(fitInside(16, 9, 160, 200)).toEqual({ width: 160, height: 90 });
    expect(fitInside(9, 16, 400, 160)).toEqual({ width: 90, height: 160 });
  });
});

describe("exportFilename", () => {
  it("joins the parts into one lower-case name", () => {
    expect(exportFilename(["2026-001", "Main film", "shot-list"], "pdf")).toBe(
      "2026-001-main-film-shot-list.pdf",
    );
  });

  it("drops accents, symbols and empty parts", () => {
    expect(slugify("  Café – Été / 30s (v2)  ")).toBe("cafe-ete-30s-v2");
    expect(exportFilename(["2026.002", "???", "storyboard"], "pdf")).toBe("2026-002-storyboard.pdf");
    expect(exportFilename(["", ""], "csv")).toBe("export.csv");
  });

  it("never contains characters that would break the download header", () => {
    expect(exportFilename(['a"b\r\nc', "d;e"], "pdf")).toBe("a-b-c-d-e.pdf");
  });
});

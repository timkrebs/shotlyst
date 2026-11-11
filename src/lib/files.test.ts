import { describe, expect, it } from "vitest";

import {
  fileExtension,
  fileKind,
  fitWithin,
  formatBytes,
  initials,
  isStoragePathFor,
  storagePath,
} from "./files";

const PROJECT = "11111111-2222-3333-4444-555555555555";
const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("fileKind", () => {
  it("maps mime types to kinds", () => {
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("text/plain")).toBe("file");
  });
});

describe("fileExtension", () => {
  it("returns the lower-case extension or bin", () => {
    expect(fileExtension("Still 01.JPG")).toBe("jpg");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension("README")).toBe("bin");
    expect(fileExtension("weird.na/me")).toBe("bin");
  });
});

describe("storage paths", () => {
  it("builds project and library paths", () => {
    expect(storagePath(PROJECT, "files", FILE, "png")).toBe(`${PROJECT}/files/${FILE}.png`);
    expect(storagePath(null, "avatars", FILE, "jpg")).toBe(`library/avatars/${FILE}.jpg`);
  });

  it("accepts only well-formed paths of the right owner", () => {
    expect(isStoragePathFor(`${PROJECT}/files/${FILE}.png`, PROJECT)).toBe(true);
    expect(isStoragePathFor(`library/avatars/${FILE}.jpg`, null)).toBe(true);
    expect(isStoragePathFor(`${PROJECT}/files/${FILE}.png`, null)).toBe(false);
    expect(isStoragePathFor(`library/avatars/${FILE}.jpg`, PROJECT)).toBe(false);
    expect(isStoragePathFor(`${PROJECT}/files/../${FILE}.png`, PROJECT)).toBe(false);
    expect(isStoragePathFor(`${PROJECT}/files/name.png`, PROJECT)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });
});

describe("fitWithin", () => {
  it("scales the longer edge down and never up", () => {
    expect(fitWithin(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440 });
    expect(fitWithin(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Olivia Owner")).toBe("OO");
    expect(initials("eddie")).toBe("E");
    expect(initials("  ")).toBe("?");
  });
});

import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, isValidTimeZone, timeZones } from "./format";

describe("format", () => {
  it("formats dates in UTC", () => {
    expect(formatDate("2026-11-10T23:30:00Z")).toBe("10 Nov 2026");
    expect(formatDateTime("2026-11-10T23:30:00Z")).toBe("10 Nov 2026, 23:30 UTC");
    expect(formatDate(null)).toBe("–");
  });

  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(timeZones()[0]).toBe("UTC");
    expect(timeZones()).toContain("Europe/Berlin");
  });
});

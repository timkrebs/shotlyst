// RFC 4180 CSV with a byte-order mark, so spreadsheet apps read UTF-8.

function escapeCell(value: string): string {
  // A leading =, +, - or @ would be run as a formula by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return `﻿${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

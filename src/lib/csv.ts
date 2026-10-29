export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const spreadsheetSafe = /^\s*[=+\-@]/u.test(text) ? `'${text}` : text;
  return /[",\r\n]/u.test(spreadsheetSafe) ? `"${spreadsheetSafe.replaceAll('"', '""')}"` : spreadsheetSafe;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function safeFilename(label: string, extension: "csv" | "json", now = new Date()): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase()
    .slice(0, 60) || "youtube-research";
  return `${slug}-${now.toISOString().slice(0, 10)}.${extension}`;
}

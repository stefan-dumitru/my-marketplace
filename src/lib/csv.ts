import { stringify } from "csv-stringify/sync";

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  return stringify(rows, {
    header: true,
    columns: columns.map((c) => ({ key: c.key, header: c.header })),
  });
}

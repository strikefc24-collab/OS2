import type { ParsedSupplierRow } from "@/app/actions/supplier";

const HEADER_SEARCH_LIMIT = 10;

function cleanPrice(cell: unknown): number {
  return parseFloat(String(cell ?? "").replace(/[^\d.-]/g, "")) || 0;
}

/**
 * Parses the 2D array from `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
 * The header row is the first of the first 10 rows containing a "Description"
 * cell. Price is read from a "Price" header when present, otherwise from the
 * 2nd column of the sheet. Category is optional.
 */
export function parseSupplierRows(rows: unknown[][]): ParsedSupplierRow[] {
  let headerIdx = -1;
  let nameCol = -1;

  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_LIMIT); i++) {
    const col = (rows[i] ?? []).findIndex((c) => /description/i.test(String(c ?? "")));
    if (col !== -1) {
      headerIdx = i;
      nameCol = col;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error(
      'Could not find a "Description" column header in the first 10 rows of this sheet.'
    );
  }

  const header = (rows[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const priceHeaderCol = header.findIndex((c) => /price/i.test(c));
  const priceCol = priceHeaderCol !== -1 ? priceHeaderCol : 1;
  const categoryCol = header.findIndex((c) => /category/i.test(c));

  const parsed: ParsedSupplierRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = String(row[nameCol] ?? "").trim();
    if (!name) continue;

    parsed.push({
      name,
      category: categoryCol !== -1 ? String(row[categoryCol] ?? "").trim() || null : null,
      price: cleanPrice(row[priceCol]),
      rowNumber: i + 1,
    });
  }

  if (parsed.length === 0) throw new Error("No products with a name were found in this sheet.");
  return parsed;
}

export type DuplicateConflict = {
  name: string;
  entries: { rowNumber: number; price: number }[];
};

/**
 * Names that appear more than once with different prices. The import keeps the
 * last row for each name, so these need a human decision before importing.
 */
export function findDuplicateConflicts(rows: ParsedSupplierRow[]): DuplicateConflict[] {
  const byName = new Map<string, DuplicateConflict>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    const entry = { rowNumber: r.rowNumber ?? 0, price: Math.round(r.price * 100) / 100 };
    const existing = byName.get(key);
    if (existing) existing.entries.push(entry);
    else byName.set(key, { name: r.name, entries: [entry] });
  }
  return [...byName.values()].filter(
    (d) => d.entries.length > 1 && new Set(d.entries.map((e) => e.price)).size > 1
  );
}

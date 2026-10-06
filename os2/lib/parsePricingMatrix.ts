import type { WorkSheet } from "xlsx";
import type { PricingMatrix } from "@/app/actions/customer";

const HEADER_SEARCH_LIMIT = 10;
const FORMULA_ERROR =
  'This sheet contains formulas. Select all cells, copy, then use "Paste as Values" and upload again.';

function cleanNumber(val: unknown): number {
  return parseFloat(String(val ?? "").replace(/[^\d.-]/g, "")) || 0;
}

function isBlank(val: unknown): boolean {
  return val == null || String(val).trim() === "";
}

/** A formula cell with no cached value would otherwise surface as a silent blank/NaN. */
function assertNoUncachedFormulas(sheet: WorkSheet) {
  for (const [addr, cell] of Object.entries(sheet)) {
    if (addr.startsWith("!")) continue;
    const c = cell as { f?: string; v?: unknown };
    if (c.f !== undefined && c.v === undefined) throw new Error(FORMULA_ERROR);
  }
}

/**
 * Parses the 2D array from `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
 * Column 0 is ITEM NAME, column 1 is SUPPLIER PRICE, columns 2+ are customer
 * names. Pass the worksheet too so uncached formula cells can be rejected.
 */
export function parsePricingMatrix(rows: unknown[][], sheet?: WorkSheet): PricingMatrix {
  if (sheet) assertNoUncachedFormulas(sheet);

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_LIMIT); i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    if (cells.includes("item name")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('Could not find an "ITEM NAME" header in the first 10 rows of this sheet.');
  }

  for (const row of rows.slice(headerIdx)) {
    if ((row ?? []).some((c) => typeof c === "string" && c.trim().startsWith("="))) {
      throw new Error(FORMULA_ERROR);
    }
  }

  const header = rows[headerIdx] ?? [];
  const customerCols: { col: number; name: string }[] = [];
  for (let col = 2; col < header.length; col++) {
    const name = String(header[col] ?? "").trim();
    if (name) customerCols.push({ col, name });
  }

  if (customerCols.length === 0) {
    throw new Error("No customer columns found. Customer names should start from the 3rd column.");
  }

  const parsed: PricingMatrix["rows"] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = String(row[0] ?? "").trim();
    if (!name) continue;

    parsed.push({
      name,
      supplierPrice: cleanNumber(row[1]),
      prices: customerCols.map(({ col }) => (isBlank(row[col]) ? null : cleanNumber(row[col]))),
    });
  }

  if (parsed.length === 0) throw new Error("No item rows were found below the header.");

  return { customerNames: customerCols.map((c) => c.name), rows: parsed };
}

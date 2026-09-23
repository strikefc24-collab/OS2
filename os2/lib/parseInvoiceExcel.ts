export type ParsedExcelItem = {
  productName: string;
  category: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

export type ParsedExcelInvoice = {
  items: ParsedExcelItem[];
  invoiceTotal: number;
};

const STOP_WORDS = /subtotal|total|balance/i;

type ColumnMap = {
  no: number;
  category: number;
  name: number;
  qty: number;
  priceCtn: number;
  discount: number;
  netPrice: number;
  netTotal: number;
};

function findHeaderRow(rows: unknown[][]): { rowIdx: number; columns: ColumnMap } | null {
  const searchLimit = Math.min(rows.length, 15);

  for (let rowIdx = 0; rowIdx < searchLimit; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    const cells = row.map((cell) => (cell == null ? "" : String(cell).trim()));

    const hasProductName = cells.some((c) => /product name/i.test(c));
    const hasQty = cells.some((c) => /^qty$/i.test(c) || /quantity/i.test(c));
    if (!hasProductName || !hasQty) continue;

    const findCol = (pattern: RegExp) => cells.findIndex((c) => pattern.test(c));

    const columns: ColumnMap = {
      no: findCol(/^no\.?$/i),
      category: findCol(/category/i),
      name: findCol(/product name/i),
      qty: findCol(/^qty$/i) !== -1 ? findCol(/^qty$/i) : findCol(/quantity/i),
      priceCtn: findCol(/price\s*\/?\s*ctn/i),
      discount: findCol(/discount/i),
      netPrice: findCol(/net price/i),
      netTotal: findCol(/net total/i),
    };

    if (columns.name === -1 || columns.qty === -1) continue;

    return { rowIdx, columns };
  }

  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,$\s]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function rowContainsStopWord(row: unknown[]): boolean {
  return row.some((cell) => typeof cell === "string" && STOP_WORDS.test(cell));
}

/**
 * Parses the 2D array produced by `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
 * The sheet has a few free-form header rows (title, date) before the real table,
 * so the table header is located dynamically rather than assumed at a fixed row.
 */
export function parseInvoiceRows(rows: unknown[][]): ParsedExcelInvoice {
  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(
      'Could not locate the invoice table header (a row with "Product Name" and "QTY" columns) in the first 15 rows of this sheet.'
    );
  }

  const { rowIdx: headerRowIdx, columns } = header;

  // Prefer Net Price (post-discount unit cost); fall back to Price/CTN if Net Price is absent.
  const priceCol = columns.netPrice !== -1 ? columns.netPrice : columns.priceCtn;
  if (priceCol === -1) {
    throw new Error('Could not find a "Net Price" or "Price/CTN" column in the invoice table header.');
  }

  const items: ParsedExcelItem[] = [];
  let invoiceTotal = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    if (rowContainsStopWord(row)) break;

    const productName = columns.name !== -1 ? String(row[columns.name] ?? "").trim() : "";
    if (!productName) continue;

    const quantity = Math.trunc(toNumber(row[columns.qty]));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const unitCost = toNumber(row[priceCol]);
    if (!Number.isFinite(unitCost) || unitCost < 0) continue;

    const category =
      columns.category !== -1 ? String(row[columns.category] ?? "").trim() || null : null;

    const parsedLineTotal = columns.netTotal !== -1 ? toNumber(row[columns.netTotal]) : NaN;
    const lineTotal = Number.isFinite(parsedLineTotal) ? parsedLineTotal : quantity * unitCost;

    items.push({ productName, category, quantity, unitCost, lineTotal });
    invoiceTotal += lineTotal;
  }

  if (items.length === 0) {
    throw new Error("No line items with a valid quantity and price were found in this invoice.");
  }

  return { items, invoiceTotal };
}

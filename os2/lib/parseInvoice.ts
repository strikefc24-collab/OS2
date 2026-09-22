export type ParsedInvoiceItem = {
  productName: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number | null;
};

export type ParsedInvoice = {
  invoiceNo: string | null;
  invoiceDate: Date | null;
  items: ParsedInvoiceItem[];
};

const MONTH_DATE_RE =
  /Date\s*[:\-]?\s*\n?\s*(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i;

const NUMERIC_DATE_RE = /Date\s*[:\-]?\s*\n?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;

const INVOICE_NO_RE =
  /Invoice\s*(?:No\.?|Number|#)\s*[:\-]?\s*\n?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*)/i;

function parseHeader(text: string): { invoiceNo: string | null; invoiceDate: Date | null } {
  let invoiceDate: Date | null = null;

  const monthMatch = text.match(MONTH_DATE_RE);
  if (monthMatch) {
    const parsed = new Date(monthMatch[1]);
    if (!Number.isNaN(parsed.getTime())) invoiceDate = parsed;
  }

  if (!invoiceDate) {
    const numericMatch = text.match(NUMERIC_DATE_RE);
    if (numericMatch) {
      const parsed = new Date(numericMatch[1]);
      if (!Number.isNaN(parsed.getTime())) invoiceDate = parsed;
    }
  }

  const invoiceNoMatch = text.match(INVOICE_NO_RE);
  const invoiceNo = invoiceNoMatch ? invoiceNoMatch[1].trim() : null;

  return { invoiceNo, invoiceDate };
}

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, "").trim());
}

/**
 * Line items may come through pipe-delimited (`1 | NAME | Category | 1 | 87.00 | | 87.00 | 87.00`)
 * or space-delimited depending on how the source PDF laid out its table. Both are tried per line.
 */
function parsePipeDelimitedLine(line: string): ParsedInvoiceItem | null {
  if (!line.includes("|")) return null;

  const cols = line.split("|").map((c) => c.trim());
  if (cols.length < 5) return null;
  if (!/^\d+$/.test(cols[0])) return null;

  const productName = cols[1];
  const category = cols[2] || null;
  const quantity = parseInt(cols[3], 10);
  const unitPrice = toNumber(cols[4]);

  if (!productName || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;

  const numericTail = cols
    .slice(5)
    .map((c) => toNumber(c))
    .filter((n) => Number.isFinite(n));
  const lineTotal = numericTail.length > 0 ? numericTail[numericTail.length - 1] : null;

  return { productName, category, quantity, unitPrice, lineTotal };
}

const SPACE_DELIMITED_RE =
  /^\s*\d+\s+(.+?)\s+([A-Za-z][A-Za-z\s]*?)\s+(\d+)\s+([\d,]+\.\d{2})\s+(?:[\d,]+\.\d{2}\s+)*([\d,]+\.\d{2})\s*$/;

function parseSpaceDelimitedLine(line: string): ParsedInvoiceItem | null {
  const match = line.match(SPACE_DELIMITED_RE);
  if (!match) return null;

  const [, productName, category, qtyRaw, unitPriceRaw, totalRaw] = match;
  const quantity = parseInt(qtyRaw, 10);
  const unitPrice = toNumber(unitPriceRaw);
  const lineTotal = toNumber(totalRaw);

  if (!productName.trim() || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;

  return {
    productName: productName.trim(),
    category: category.trim() || null,
    quantity,
    unitPrice,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : null,
  };
}

function parseItemLine(line: string): ParsedInvoiceItem | null {
  return parsePipeDelimitedLine(line) ?? parseSpaceDelimitedLine(line);
}

export function parseInvoiceText(rawText: string): ParsedInvoice {
  const { invoiceNo, invoiceDate } = parseHeader(rawText);

  const items: ParsedInvoiceItem[] = [];
  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const item = parseItemLine(trimmed);
    if (item) items.push(item);
  }

  return { invoiceNo, invoiceDate, items };
}

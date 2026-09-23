# Phase 1 — System 2 (Retail Inventory & Purchase Management)

This document records everything built in Phase 1: the database architecture, the app shell, the manual purchase-entry workflow, and the automated invoice-ingestion engine (which pivoted twice during development — see "Ingestion engine history" below). It's meant as a handover reference for whoever picks up Phase 2.

---

## 1. Tech stack

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript, strict mode.
- **Tailwind CSS v4** for styling — soft slate/indigo palette, no pure black/white.
- **Prisma ORM v6.19.3** against **PostgreSQL**. (Note: `npm install prisma` today resolves to `8.0.0-rc.15`, a completely different "Prisma Developer Platform" CLI with no `db push`/`migrate dev`. Both `prisma` and `@prisma/client` are pinned to `6.19.3` in `package.json` so the classic self-hosted workflow works.)
- **lucide-react** for icons.
- **xlsx (SheetJS) 0.20.3** for Excel parsing — installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` rather than the npm registry (see Security notes).
- **tsx** for running the TypeScript seed script.

---

## 2. Database schema (`prisma/schema.prisma`)

Six models, all relations wired up:

| Model | Purpose | Key fields |
|---|---|---|
| `Supplier` | A vendor System 2 buys from (e.g. "Team X"). | `code` (unique, e.g. `SUPP-0001`), `outstandingBalance` (running amount owed) |
| `Product` | A stocked SKU. | `sku` (unique), `currentStock`, `costPrice`, `sellingPrice`, belongs to a `Supplier` |
| `PurchaseInvoice` | A single supplier invoice booked into the system. | `invoiceNo` (unique), `totalAmount`, `status` (`UNPAID`/`PARTIAL`/`PAID`) |
| `PurchaseItem` | One line item on an invoice. | `quantity`, `unitCost`, `totalCost`, links `PurchaseInvoice` ↔ `Product` |
| `SupplierLedger` | Running accounts-payable ledger per supplier (debits/credits/balance). | `tranType` (`PURCHASE_INVOICE` / `PAYMENT_MADE`), `debit`, `credit`, `balance` |
| `StockMovement` | Audit trail of every stock change. | `movementType` (`PURCHASE`/`SALE`/`ADJUSTMENT`/`DAMAGE`), `previousStock`, `newStock`, `referenceNo` |

Every purchase transaction touches all six models atomically (see §4).

`prisma/seed.ts` seeds one supplier, "Team X" (`code: SUPP-0001`), so the purchase form always has a default option. Run via `npm run prisma:seed`.

---

## 3. App shell

### `lib/prisma.ts`
Standard hot-reload-safe Prisma Client singleton — stores the client on `globalThis` in development so Next.js's fast refresh doesn't spawn a new connection pool on every edit.

### `app/layout.tsx`
Root layout. Sets the soft `bg-slate-50` background, renders `<Sidebar />` beside a `<main>` content area (`p-4 md:p-8`), and lays the two out as a row on desktop / column on mobile (`flex-col md:flex-row`).

### `components/Sidebar.tsx`
The left navigation, client component (`usePathname()` for active-link highlighting).
- **Desktop:** fixed `w-64` column, always visible.
- **Mobile/tablet:** collapses to a top bar with a hamburger button; tapping it opens an off-canvas drawer (an absolutely-positioned panel over a dimmed backdrop) with the same nav links, closing on link click or backdrop click.
- **Links:** Dashboard (`/`), Purchases (`/purchases`), Inventory (`/inventory`) — all live; Sales, Customer Ledger, Expenses & Petty Cash — rendered as non-clickable, muted placeholders (`cursor-not-allowed`, no `href`) since those modules don't exist yet; Supplier Ledger (`/suppliers`) — live.

### `app/globals.css`
Overrides the default Next.js starter theme: background `#f8fafc` (slate-50), foreground `#1e293b` (slate-800), no dark-mode media query (client asked for one consistent eye-friendly light theme, not an auto dark mode).

---

## 4. Purchase engine — server actions (`app/actions/purchase.ts`)

This file has three exported functions:

### `postPurchaseInvoice(tx, params)` — private, shared transaction core
Not exported; it's the common final leg that **both** manual entry and file-upload ingestion call, so the accounting logic only exists once. Given a resolved list of `{productId, quantity, unitCost, totalCost}` items, it:
1. Creates the `PurchaseInvoice` + all `PurchaseItem` rows in one nested-write.
2. For each item, increments `Product.currentStock` and writes a `StockMovement` row (`PURCHASE`) recording before/after stock levels for audit purposes.
3. Computes the new supplier balance and writes a `SupplierLedger` entry (`credit` = invoice total, `tranType: PURCHASE_INVOICE`).
4. Updates `Supplier.outstandingBalance` to the new balance.

Everything above runs inside the caller's `prisma.$transaction`, so a failure at any step rolls back the whole invoice — stock and ledger can never drift out of sync with the invoice record.

### `createPurchaseInvoice(data)` — manual entry
Used by the "+ New Purchase Invoice" modal. Validates supplier/invoice number/line items are present and numeric, then for each line item **upserts** a `Product` by `sku` (creates it with `currentStock: 0` if the SKU is new), builds the resolved-items array, and hands off to `postPurchaseInvoice`. Calls `revalidatePath` on `/purchases`, `/inventory`, `/suppliers`, and `/` afterward so all four pages reflect the change immediately.

### `parseAndCreatePurchaseInvoice(formData)` — Excel ingestion
Used by the "Upload Excel Invoice" flow. Takes a `FormData` containing `file` (the `.xlsx`/`.xls` File) and `supplierId`:
1. Validates the file extension and that a supplier was chosen.
2. Reads the buffer with `XLSX.read()`, takes the first sheet, converts it to a raw 2D array with `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
3. Hands that array to `parseInvoiceRows()` (see §5) to get back structured items + total.
4. Derives an invoice number from the filename if it looks like a real reference (contains letters+digits or a 4+ digit run and isn't a generic name like "invoice.xlsx"); otherwise generates `PINV-<timestamp>`.
5. For each parsed item, finds an existing `Product` by `name` (case-insensitive) **and** `supplierId`; if none exists, creates one with a generated SKU (`XLS-<slugified-name>-<random>`).
6. Hands the resolved items to the same `postPurchaseInvoice` used by manual entry — so a spreadsheet upload produces byte-identical bookkeeping to typing the invoice in by hand.

### `getPurchaseInvoices()`
Fetches all invoices with their supplier and line items (including each item's product), shaped into a flat structure the UI can render directly (avoids leaking raw Prisma relation objects to client components).

---

## 5. Excel parsing engine (`lib/parseInvoiceExcel.ts`)

This is the "resilience" layer — it doesn't assume the table starts at a fixed row, because the real files have a variable number of title/date rows above the data.

**`findHeaderRow(rows)`** scans the first 15 rows looking for one that contains both a cell matching `/product name/i` and one matching `/^qty$/i` (or `/quantity/i`). Once found, it maps column indexes for `NO`, `Category`, `Product Name`, `QTY`, `Price/CTN`, `Discount`, `Net Price`, and `Net Total` by regex against the header cell text — so column *order* doesn't matter, only that the header text is recognizable.

**`parseInvoiceRows(rows)`** then walks every row after the header:
- Stops immediately (`break`) on the first row containing "Subtotal", "Total", or "Balance" (case-insensitive) — this is the footer boundary.
- Skips rows with no product name, or with a missing/zero/non-numeric quantity.
- Reads the unit cost from **Net Price** if that column exists, falling back to **Price/CTN** if not (Net Price is post-discount, so it's preferred as the true booked cost).
- Reads `Net Total` for the line total if present, else computes `quantity × unitCost`.
- Accumulates `invoiceTotal` and throws a descriptive error if the header can't be found or zero valid items result (surfaced directly in the upload modal).

This was unit-verified during development with a synthetic in-memory workbook built via `XLSX.utils.aoa_to_sheet()` (title rows → header row → two line items → Subtotal/Grand Total footer) — the parser correctly skipped the preamble, extracted both items with correct quantities/prices, and stopped before the footer.

---

## 6. Frontend pages

### `app/page.tsx` — Dashboard
Server component, `export const dynamic = "force-dynamic"` (always fetches live data, never statically cached — this is an operational dashboard, not marketing content). Runs three Prisma aggregates in parallel (`Promise.all`) and renders four metric cards: **Total Purchases** (sum of all invoice totals), **Supplier Outstanding** (sum of all suppliers' balances), **Total Stock Value** (Σ `currentStock × costPrice` across products), **Total Active Products** (product count). Currency formatted via `Intl.NumberFormat` (MYR).

### `app/purchases/page.tsx` — Purchases (server component)
Fetches `getPurchaseInvoices()` and `getSuppliers()` in parallel, passes both down to the client component below. Also `force-dynamic`.

### `components/PurchasesClient.tsx` — Purchases (client component, the bulk of the UI)
- Header row: title + two buttons — **"Upload Excel Invoice"** (opens `UploadModal`) and **"+ New Purchase Invoice"** (opens `PurchaseInvoiceModal`).
- **Dropzone banner:** a full-width dashed-border button ("Drag & Drop Excel Invoice from Team X") that also opens `UploadModal` — so there are two entry points into the same upload flow (a discoverable big banner, and a compact header button).
- **Invoice history table:** every invoice, click-to-expand (chevron icon) revealing a nested table of that invoice's line items (SKU, product, qty, unit cost, line total). Status column uses `StatusBadge`.
- State management: `modalOpen`/`uploadOpen` booleans for the two modals, `expandedId` for which invoice row is expanded, `toastMessage` for the post-upload success toast. After either modal succeeds, calls `router.refresh()` so the server-fetched invoice/supplier data is re-pulled without a full page reload.

### `components/PurchaseInvoiceModal.tsx` — manual entry form
Supplier dropdown, invoice number + date inputs, and a dynamic line-item table (SKU / Product Name / Qty / Unit Cost / auto-computed Line Total, with add/remove row buttons). On submit, calls `createPurchaseInvoice` directly (Next.js Server Actions can be invoked like normal async functions from client components) and reports validation/server errors inline.

### `components/UploadModal.tsx` — Excel upload form
Supplier dropdown (with a note that the spreadsheet's stated party may not match the System 2 supplier record — the user must explicitly confirm), and a drag-and-drop zone that also accepts click-to-browse (`accept=".xlsx,.xls"`). Shows the chosen filename, a "Parsing Excel & updating inventory..." loading state while the server action runs, and inline errors (bad extension, no header found, no valid items, etc.). On success, calls back up to `PurchasesClient` with a summary message which becomes the toast text.

### `components/Toast.tsx`
Minimal fixed-position bottom-right success toast, auto-dismisses after 5 seconds or on manual close.

### `components/StatusBadge.tsx`
Small pill component mapping `PAID`/`PARTIAL`/`UNPAID` to emerald/amber/rose badge colors.

### `app/inventory/page.tsx` — Inventory
Server component (`force-dynamic`). Lists every product with SKU, name, category, current stock, cost price, selling price, and computed stock value (`currentStock × costPrice`) per row.

### `app/suppliers/page.tsx` — Supplier Ledger
Server component (`force-dynamic`). Lists every supplier with code, name, contact, email, and outstanding balance. (Per-supplier transaction history via `getSupplierLedger()` exists in `app/actions/supplier.ts` but isn't wired into the UI yet — flagged as a Phase 2 item below.)

---

## 7. Ingestion engine history (why it changed twice)

Phase 1 went through two ingestion approaches before landing on the current one — worth recording so Phase 2 doesn't repeat the investigation:

1. **PDF text parsing (`pdf-parse`, no OCR)** — built first, per the original spec assumption that Team X's invoices were "natively digital PDFs." Verification against the actual `TestInvoice.pdf` in the repo showed it was a **flattened image with zero embedded text** (Producer: "Microsoft: Print To PDF" — a screenshot printed to PDF, not a real export), so text-extraction-only parsing could never work on it. This code path (`lib/parseInvoice.ts`, the `pdf-parse` dependency) has since been **fully removed**.
2. **Excel parsing (`xlsx`, current)** — the client scrapped PDF/OCR entirely in favor of uploading the supplier's Excel invoice directly. This is what's documented above and is the current, working ingestion path.

---

## 8. Security notes

- **`xlsx` supply-chain fix:** `npm install xlsx` resolves to `0.18.5` on the npm registry, which carries two high-severity, unpatched advisories — prototype pollution ([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)) and a ReDoS ([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)) — with no fix available via npm, because SheetJS (the maintainer) stopped publishing patched releases there. Since this exact library parses **attacker-uploadable files**, that's a live attack surface, not theoretical. The project instead installs `xlsx@0.20.3` directly from SheetJS's own CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), their official distribution channel for patched builds. `npm audit` no longer flags it.
- **Server Actions as the only mutation path:** `createPurchaseInvoice` and `parseAndCreatePurchaseInvoice` are the only ways to write purchase data, and both run entirely server-side (Next.js Server Actions). Neither currently has authentication/authorization checks — there's no auth system yet in Phase 1, so anyone who can reach the app can post invoices. This needs to be closed before any real deployment (see Phase 2 items).

---

## 9. Setup & running

```bash
# 1. Point DATABASE_URL at a real Postgres instance (.env)
DATABASE_URL="postgresql://user:password@localhost:5432/os2?schema=public"

# 2. Push the schema (classic Prisma 6.x workflow — see the CLI version note in §1)
npx prisma db push

# 3. Generate the Prisma Client (also runs automatically on install in most cases)
npx prisma generate

# 4. Seed the default "Team X" supplier
npm run prisma:seed

# 5. Start the dev server
npm run dev
```

`.env.example` documents the required variable. `.env` itself is gitignored except for `.env.example` (explicitly un-ignored in `.gitignore`).

---

## 10. Known gaps / suggested Phase 2 items

- **No authentication/authorization** — every server action is an open, unauthenticated POST endpoint. Needs a session/auth layer and per-action checks before real use.
- **Supplier Ledger page is read-only** — `getSupplierLedger()` exists but isn't rendered; there's no drill-down from the Suppliers list into a supplier's individual ledger transactions yet.
- **No payment recording** — `SupplierLedger`'s `PAYMENT_MADE` tran type and `PurchaseInvoice.status` (`PARTIAL`/`PAID`) exist in the schema but nothing in the UI currently creates a payment or transitions an invoice out of `UNPAID`.
- **Sales, Customer Ledger, Expenses & Petty Cash** are nav placeholders only — no schema, actions, or pages exist for them yet.
- **No automated tests** — verification so far has been manual (`tsc --noEmit`, `eslint`, `next build`, and one synthetic-workbook smoke test for the Excel parser). Worth adding real unit tests for `parseInvoiceRows` against a broader set of edge cases (missing columns, multiple sheets, merged header cells) once more real supplier files are available.
- **Duplicate-invoice handling:** `invoiceNo` is a unique DB constraint, but neither server action currently catches the resulting Prisma error and turns it into a friendly "this invoice was already imported" message — it will currently surface as a raw error in the modal.

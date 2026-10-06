# System 2 — Full Site Reference

Retail inventory, purchasing, supplier and customer management. This document describes the site **as it exists today**: every page, what it does, how the data model fits together, and what is not built yet. It replaces the earlier Phase 1 handover notes, which described the old SKU system.

Written for: the team that uses and maintains the site.

---

## 1. At a glance

| Area | Page | Status |
|---|---|---|
| Dashboard | `/` | Live: headline metrics + a supplier/customer chart |
| Purchases | `/purchases` | Live: manual invoices, Excel invoice upload, edit, delete |
| Inventory | `/inventory` | Live: product list, add/edit/delete, search, pagination |
| Suppliers | `/suppliers` | Live: supplier list, product catalog + Excel price import, ledger, payments |
| Customers | `/customers` | Live: customer list, ledger, payments, per-customer prices, pricing matrix upload |
| Sales | `/sales` | Not built (sidebar item is greyed out) |
| Expenses & Petty Cash | `/expenses` | Not built (sidebar item is greyed out) |

**Global rules applied everywhere**
- **No currency symbols.** Money is a plain number with two decimals (`150.00`), via `formatMoney()` in `lib/format.ts`.
- **No green in the UI.** Palette is slate, indigo, sky-blue, red and amber only.
- Product IDs look like `PROD-00001`, customer IDs like `CUST-0001`, supplier codes like `SUPP-0001`.

---

## 2. Tech stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**.
- **Tailwind CSS v4**.
- **Prisma 6.19.3** on **PostgreSQL**. (Pinned: newer `prisma` releases resolve to a different CLI with no `db push`.)
- **xlsx (SheetJS) 0.20.3**, installed from SheetJS's own CDN rather than npm. The npm `0.18.5` build has unpatched high-severity advisories and this library reads user-uploaded files.
- **lucide-react** icons, **recharts** charts, **tsx** for the seed script.
- Runs in **Docker** (`docker-compose.yml`): a `system2_postgres` container (Postgres 15) and a `system2_nextjs` dev container.

All writes go through **Next.js Server Actions** in `app/actions/`. There are no REST endpoints.

---

## 3. How the site is laid out

- **Sidebar** (`components/Sidebar.tsx`): fixed on desktop; on mobile it becomes a top bar with a hamburger that opens a drawer. Links: Dashboard, Purchases, Inventory, Sales (disabled), Customers, Suppliers, Expenses & Petty Cash (disabled).
- **Pattern used by most pages:** a server component (`page.tsx`, `force-dynamic`) loads data and passes it to a client component that handles search, tabs, modals and toasts. After a write, the client calls `router.refresh()` and the server action calls `revalidatePath()`.
- **Shared UI pieces:** `Pagination` (25 rows per page, set by `PAGE_SIZE`), `SearchInput`, `Toast`, `ConfirmDialog`, `StatusBadge`.

---

## 4. Data model (`prisma/schema.prisma`)

| Model | What it holds |
|---|---|
| `Supplier` | `name`, `code` (unique), `contact`, `email`, `outstandingBalance` (what we owe them) |
| `Product` | `productID` (unique, `PROD-XXXXX`), `name`, `category`, `currentStock`, `costPrice`, optional `supplierId` |
| `PurchaseInvoice` | `invoiceNo` (unique), `invoiceDate`, `totalAmount`, `status` (`UNPAID`/`PARTIAL`/`PAID`), `supplierId` |
| `PurchaseItem` | One invoice line: `quantity`, `unitCost`, `totalCost`. Deleted with its invoice |
| `SupplierLedger` | Supplier transactions: `PURCHASE_INVOICE` (debit) and `PAYMENT_MADE` (credit) |
| `StockMovement` | Audit trail of every stock change: `PURCHASE`, `SALE`, `ADJUSTMENT`, `DAMAGE`, with before/after stock |
| `Customer` | `customerID` (unique, `CUST-XXXX`), `name`, `phone`, `address`, `openingBalance`, `creditBalance` (what they owe) |
| `CustomerLedger` | Customer transactions: `SALES_INVOICE` (debit) and `PAYMENT_RECEIVED` (credit) |
| `CustomerPrice` | A custom price for one customer and one product. Unique on customer + product; deleted if either is deleted |

Notes:
- `Product` has **no selling price**. It was removed on purpose. What a customer pays lives in `CustomerPrice`.
- ID helpers are in `lib/idGenerator.ts`: `getNextProductID`, `getNextCustomerID`, `getNextInvoiceNo` (`PINV-`), `getNextPaymentRef` (`PAY-`), `getNextReceiptRef` (`RCPT-`). Each reads the **highest existing** ID and adds one, so deleting rows never causes a collision.
- `prisma/seed.ts` creates five suppliers (`SUPP-0001` to `SUPP-0005`, named "Supplier 1" to "Supplier 5").

---

## 5. Pages in detail

### Dashboard (`/`)
Four metric cards: **Total Purchases** (sum of invoice totals), **Supplier Outstanding**, **Total Stock Value** (stock × cost price), and **Total Active Products**. Below is an entity chart comparing supplier and customer counts.

### Purchases (`/purchases`)
- Lists every purchase invoice with date, supplier, total, status badge and expandable line items. Searchable by invoice number or supplier.
- **New Purchase Invoice:** pick a supplier, invoice number and date, then add line items with a product picker (type to search the supplier's products).
- **Upload Excel Invoice:** upload the supplier's invoice spreadsheet. The parser (`lib/parseInvoiceExcel.ts`) finds the header row containing "Product Name" and "QTY" in the first 15 rows, reads category, quantity and Net Price (or Price/CTN), and stops at a Subtotal/Total/Balance row. Products are matched by name within that supplier; unknown ones are created.
- **Edit invoice:** change quantities and unit costs, or remove lines. Stock and the supplier balance are adjusted to match.
- **Delete invoice:** reverses the stock added, removes the ledger entry, reduces the supplier balance.
- **Every purchase is one database transaction:** invoice + items, stock increases with `StockMovement` rows, supplier ledger debit, supplier balance. A failure rolls the whole thing back.

### Inventory (`/inventory`)
- Cards for **Total Products** and **Total Stock Value**.
- Table: Product ID, Name, Category, Stock, Cost Price, Stock Value, Actions. Search by name or product ID; paginated.
- **Add / Edit Product** (name, category, supplier, cost price, opening stock for new products). Product ID is generated automatically.
- **Delete** is blocked if the product appears on any purchase invoice.
- Stock itself can only change through purchases and invoice edits, not by editing a product.

### Suppliers (`/suppliers`)
Master-detail layout: supplier list on the left, the selected supplier on the right. The header shows code, contact, email and outstanding balance.
- **Products tab:** that supplier's products (Product ID, Name, Category, Cost Price), with search (name, ID, category) and pagination.
- **Import Products (Excel)** (sky-blue button):
  - Finds the header row containing "Description" in the first 10 rows. Price comes from a "Price" column if present, otherwise the 2nd column. A "Category" column is optional.
  - Prices are cleaned with `parseFloat(String(cell).replace(/[^\d.-]/g, '')) || 0`. Rows with no name are skipped.
  - Existing products (matched by lowercase name within the supplier) get their cost price and category updated. New names are created with stock 0 and a new `PROD-XXXXX` ID.
  - **Duplicate warning:** if a name appears more than once with different prices, the dialog lists the rows and asks you to fix the file or "Import Anyway" (the last row wins).
  - **Efficient by design:** the supplier's products are loaded once into a Map, the next ID is read once and incremented in memory, and all writes are one `createMany` plus updates in a single transaction.
- **Ledger tab:** running balance, debits (invoices) and credits (payments), paginated. **Log Payment** records a payment to the supplier and lowers their balance.

### Customers (`/customers`)
Master-detail layout with a global **Upload Pricing Matrix** button at the top.
- **Left panel:** searchable list (name, ID or phone) showing each customer's balance. **Add Customer** shows the next `CUST-XXXX` and takes name, phone, address and an opening balance.
- **Right panel:** profile (contact, address, opening balance, credit balance) and two tabs:
  - **Ledger:** newest first. The running balance is recalculated on every read: it starts from the opening balance, then `previous + debit - credit` from oldest to newest, then the list is reversed. Backdated entries therefore never leave stale balances. **Log Payment** records money received and lowers the credit balance.
  - **Products:** the products this customer has a custom price for (Product ID, Name, Category, Price), with search and pagination.
- **Upload Pricing Matrix:**
  - Sheet layout: column 1 `ITEM NAME`, column 2 `SUPPLIER PRICE`, columns 3 onward are customer names. The header row is found in the first 10 rows (case and extra spaces ignored).
  - Cells starting with `=`, or formula cells with no stored value, are rejected with a "Paste as Values" message.
  - Before writing, the site compares each `SUPPLIER PRICE` with the stored cost price. If any differ, you choose **Overwrite With Sheet** (updates product cost prices) or **Keep System Prices**. Customer prices are saved either way.
  - Items and customers are matched by lowercase name. Unmatched items and unknown customer columns are skipped and listed in the result. Blank or zero customer cells are skipped.
  - Products, customers and existing prices are each loaded once; writes are a single batch.

---

## 6. Server actions (`app/actions/`)

| File | Functions |
|---|---|
| `purchase.ts` | `getPurchaseInvoices`, `createPurchaseInvoice`, `parseAndCreatePurchaseInvoice`, `updatePurchaseInvoice`, `deletePurchaseInvoice` |
| `product.ts` | `getProducts`, `createProduct`, `updateProduct`, `deleteProduct` |
| `supplier.ts` | `getSuppliers`, `getSupplierLedger`, `logSupplierPayment`, `getSupplierProducts`, `bulkUpsertSupplierProducts` |
| `customer.ts` | `getCustomers`, `previewNextCustomerID`, `createCustomer`, `getCustomerLedger`, `logCustomerPayment`, `getCustomerPrices`, `analyzePricingMatrix`, `bulkUpsertPricingMatrix` |

Excel parsers live in `lib/`: `parseInvoiceExcel.ts` (purchase invoices), `parseSupplierExcel.ts` (supplier price lists), `parsePricingMatrix.ts` (customer price matrix). The two newer ones run in the browser; the invoice parser runs on the server.

---

## 7. Running it

```bash
docker compose up -d          # Postgres + the Next.js dev container
npx prisma db push            # apply schema changes
npm run prisma:seed           # optional: five starter suppliers
```

- The app runs at `http://localhost:3000`.
- **Credentials:** `docker-compose.yml` sets the database to `admin` / `adminpassword` on `business_management`, and the container's `DATABASE_URL` points at it. The local `.env` is a placeholder, so running `prisma` from your own machine needs `DATABASE_URL` set to `postgresql://admin:adminpassword@localhost:5432/business_management?schema=public`.
- **After changing `schema.prisma`:** run `npx prisma db push` once (the database is shared), then `docker exec system2_nextjs npx prisma generate` and restart the container. The container keeps its own copy of `node_modules`, so skipping this causes errors like "column does not exist".
- Type check with `npx tsc --noEmit`. It reports one existing error, `LayoutProps` not found in `app/layout.tsx`, which is unrelated to recent work.

---

## 8. Known gaps and things to know

- **No authentication.** Every server action is open to anyone who can reach the site. This must be closed before real use.
- **Sales and Expenses do not exist.** `/sales` and `/expenses` have no pages. Because nothing creates sales yet, customer ledgers only ever contain payments (the `SALES_INVOICE` type is ready but unused), and customer balances can only go down.
- **Invoice status never changes.** Purchase invoices stay `UNPAID`. Logging a supplier payment lowers the supplier's balance but does not mark any invoice `PARTIAL` or `PAID`.
- **Dashboard customer count is hard-coded to 0.** The chart in `app/page.tsx` still passes `customerCount={0}` even though customers now exist. `components/charts/ProfitOverviewChart.tsx` exists but is not used on any page.
- **Duplicate names in the pricing matrix.** The supplier import warns about repeated names with conflicting prices; the pricing matrix upload does not yet, and keeps the last row.
- **Product names are only unique per supplier.** If two suppliers sell the same name, the pricing matrix picks the product whose cost price matches the sheet, otherwise the first one found.
- **Pagination is in the browser.** All rows are loaded, then split into pages of 25. Fine for thousands of rows, not for hundreds of thousands.
- **Duplicate invoice numbers** are rejected by the database but surface as a raw error rather than a friendly message.
- **No automated tests.** Verification so far has been type checks, lint, and manual and scripted spot checks.
- **Unused file:** `components/SupplierLedgerClient.tsx` is the old suppliers page and is no longer imported. It can be deleted.

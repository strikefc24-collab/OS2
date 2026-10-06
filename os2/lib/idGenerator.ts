import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

function nextSequential(prefix: string, latestCode: string | null | undefined, width: number): string {
  const match = latestCode?.match(new RegExp(`^${prefix}-(\\d+)$`));
  const nextNumber = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${String(nextNumber).padStart(width, "0")}`;
}

/** Increments a `PROD-XXXXX` ID (or starts at PROD-00001 when given none). */
export function nextProductIDAfter(latestID: string | null | undefined): string {
  return nextSequential("PROD", latestID, 5);
}

/**
 * Finds the highest existing `PROD-XXXXX` ID and returns the next one. Ordering
 * by the zero-padded ID itself (lexicographic == numeric) rather than createdAt
 * or count() means deletions and out-of-order inserts can't cause a collision.
 */
export async function getNextProductID(db: DbClient): Promise<string> {
  const latest = await db.product.findFirst({
    where: { productID: { startsWith: "PROD-" } },
    orderBy: { productID: "desc" },
    select: { productID: true },
  });

  return nextProductIDAfter(latest?.productID);
}

/** Highest existing `CUST-XXXX` plus one, same approach as getNextProductID. */
export async function getNextCustomerID(db: DbClient): Promise<string> {
  const latest = await db.customer.findFirst({
    where: { customerID: { startsWith: "CUST-" } },
    orderBy: { customerID: "desc" },
    select: { customerID: true },
  });

  return nextSequential("CUST", latest?.customerID, 4);
}

/** Same approach as getNextProductID, applied to invoice numbers. */
export async function getNextInvoiceNo(db: DbClient): Promise<string> {
  const latest = await db.purchaseInvoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNo: true },
  });

  return nextSequential("PINV", latest?.invoiceNo, 5);
}

/** Same approach, applied to customer payment receipt references. */
export async function getNextReceiptRef(db: DbClient): Promise<string> {
  const latest = await db.customerLedger.findFirst({
    where: { tranType: "PAYMENT_RECEIVED" },
    orderBy: { tranNo: "desc" },
    select: { tranNo: true },
  });

  return nextSequential("RCPT", latest?.tranNo, 5);
}

/** Same approach, applied to supplier ledger payment references. */
export async function getNextPaymentRef(db: DbClient): Promise<string> {
  const latest = await db.supplierLedger.findFirst({
    where: { tranType: "PAYMENT_MADE" },
    orderBy: { createdAt: "desc" },
    select: { tranNo: true },
  });

  return nextSequential("PAY", latest?.tranNo, 5);
}

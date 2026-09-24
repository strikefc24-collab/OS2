import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

function nextSequential(prefix: string, latestCode: string | null | undefined, width: number): string {
  const match = latestCode?.match(new RegExp(`^${prefix}-(\\d+)$`));
  const nextNumber = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${String(nextNumber).padStart(width, "0")}`;
}

/**
 * Reads the numeric suffix off the most recently created product and increments
 * it, rather than `count()`, so deleting old records can never cause the next
 * generated product ID to collide with one that still exists.
 */
export async function getNextProductID(db: DbClient): Promise<string> {
  const latest = await db.product.findFirst({
    orderBy: { createdAt: "desc" },
    select: { productID: true },
  });

  return nextSequential("PROD", latest?.productID, 5);
}

/** Same approach as getNextProductID, applied to invoice numbers. */
export async function getNextInvoiceNo(db: DbClient): Promise<string> {
  const latest = await db.purchaseInvoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNo: true },
  });

  return nextSequential("PINV", latest?.invoiceNo, 5);
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

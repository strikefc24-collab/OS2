"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getNextPaymentRef, getNextProductID, nextProductIDAfter } from "@/lib/idGenerator";

export async function getSuppliers() {
  return prisma.supplier.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * The `balance` column stored on each row is a snapshot of the supplier's
 * running total at the moment that row was inserted — it's only correct if
 * rows are entered in chronological order. A backdated entry (e.g. logging a
 * payment for last month after this month's invoices already exist) makes
 * those stored snapshots wrong for display purposes.
 *
 * To fix this without a schema change, the running balance is recomputed here
 * on every read: fetch oldest-first, walk forward summing debit - credit, then
 * reverse so the caller still sees newest-first (matching prior behavior).
 */
export async function getSupplierLedger(supplierId: string) {
  const entries = await prisma.supplierLedger.findMany({
    where: { supplierId },
    orderBy: [{ tranDate: "asc" }, { createdAt: "asc" }],
  });

  let runningBalance = 0;
  const withRunningBalance = entries.map((entry) => {
    runningBalance = runningBalance + entry.debit - entry.credit;
    return { ...entry, balance: runningBalance };
  });

  return withRunningBalance.reverse();
}

export type LogSupplierPaymentInput = {
  supplierId: string;
  date: Date;
  amount: number;
  remarks?: string;
};

/**
 * Records a payment made to a supplier. Posted as a ledger credit, which
 * reduces the outstanding balance — the mirror of a purchase invoice's debit.
 * Cash-in (money received back from a supplier) isn't supported yet — there's
 * no customer/AR side of the ledger to reconcile it against.
 */
export async function logSupplierPayment(data: LogSupplierPaymentInput) {
  if (!data.supplierId) throw new Error("Supplier is required");
  if (!Number.isFinite(data.amount) || data.amount <= 0)
    throw new Error("Amount must be a positive number");

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({
      where: { id: data.supplierId },
    });

    const newBalance = supplier.outstandingBalance - data.amount;
    const tranNo = await getNextPaymentRef(tx);

    await tx.supplierLedger.create({
      data: {
        tranDate: data.date,
        tranNo,
        tranType: "PAYMENT_MADE",
        debit: 0,
        credit: data.amount,
        balance: newBalance,
        remarks: data.remarks?.trim() || `Payment to ${supplier.name}`,
        supplierId: data.supplierId,
      },
    });

    await tx.supplier.update({
      where: { id: data.supplierId },
      data: { outstandingBalance: newBalance },
    });
  });

  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function getSupplierProducts(supplierId: string) {
  return prisma.product.findMany({
    where: { supplierId },
    orderBy: { productID: "asc" },
    select: { id: true, productID: true, name: true, category: true, costPrice: true },
  });
}

export type ParsedSupplierRow = {
  name: string;
  category: string | null;
  price: number;
  /** 1-based sheet row, used only to point the user at duplicates. */
  rowNumber?: number;
};

/**
 * Upserts a supplier's price list by product name (case-insensitive).
 * All of the supplier's existing products are loaded once into a Map, and the
 * next product ID is read once and incremented in memory, so the number of
 * queries is constant no matter how many rows are imported.
 */
export async function bulkUpsertSupplierProducts(
  supplierId: string,
  parsedRows: ParsedSupplierRow[]
) {
  if (!supplierId) throw new Error("Supplier is required");

  const existing = await prisma.product.findMany({
    where: { supplierId },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p.id]));

  // Keyed by name so a name repeated within the file collapses to its last row.
  const updates = new Map<string, { id: string; costPrice: number; category: string | null }>();
  const creates = new Map<string, Prisma.ProductCreateManyInput>();

  let lastID: string | null = null;

  for (const row of parsedRows) {
    const name = row.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const costPrice = Math.max(0, Math.round((Number(row.price) || 0) * 100) / 100);
    const category = row.category?.trim() || null;

    const existingId = existingByName.get(key);
    if (existingId) {
      updates.set(key, { id: existingId, costPrice, category });
      continue;
    }

    const pending = creates.get(key);
    if (pending) {
      pending.costPrice = costPrice;
      pending.category = category;
      continue;
    }

    lastID = lastID ? nextProductIDAfter(lastID) : await getNextProductID(prisma);
    creates.set(key, {
      productID: lastID,
      name,
      category,
      costPrice,
      currentStock: 0,
      supplierId,
    });
  }

  await prisma.$transaction([
    ...(creates.size > 0 ? [prisma.product.createMany({ data: [...creates.values()] })] : []),
    ...[...updates.values()].map((u) =>
      prisma.product.update({
        where: { id: u.id },
        data: { costPrice: u.costPrice, category: u.category },
      })
    ),
  ]);

  revalidatePath("/suppliers");
  revalidatePath("/inventory");

  return { created: creates.size, updated: updates.size };
}

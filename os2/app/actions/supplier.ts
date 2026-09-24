"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNextPaymentRef } from "@/lib/idGenerator";

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

"use server";

import { prisma } from "@/lib/prisma";

export async function getSuppliers() {
  return prisma.supplier.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getSupplierLedger(supplierId: string) {
  return prisma.supplierLedger.findMany({
    where: { supplierId },
    orderBy: { tranDate: "desc" },
  });
}

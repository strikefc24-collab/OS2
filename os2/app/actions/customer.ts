"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNextCustomerID, getNextReceiptRef } from "@/lib/idGenerator";

export async function getCustomers() {
  return prisma.customer.findMany({ orderBy: { name: "asc" } });
}

/** Shown in the Add Customer modal; the real ID is re-generated on create. */
export async function previewNextCustomerID() {
  return getNextCustomerID(prisma);
}

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  address?: string;
  openingBalance: number;
};

export async function createCustomer(data: CreateCustomerInput) {
  if (!data.name?.trim()) throw new Error("Customer name is required");
  if (!Number.isFinite(data.openingBalance)) throw new Error("Opening balance must be a number");

  const customer = await prisma.$transaction(async (tx) => {
    const customerID = await getNextCustomerID(tx);
    return tx.customer.create({
      data: {
        customerID,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        address: data.address?.trim() || null,
        openingBalance: data.openingBalance,
        creditBalance: data.openingBalance,
      },
    });
  });

  revalidatePath("/customers");
  return customer;
}

/**
 * Running balance is recomputed on every read rather than trusted from storage,
 * so backdated entries can't leave stale snapshots: walk oldest to newest
 * starting from the opening balance (running = previous + debit - credit), then
 * reverse so the newest entry is first.
 */
export async function getCustomerLedger(customerId: string) {
  const [customer, entries] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { openingBalance: true },
    }),
    prisma.customerLedger.findMany({
      where: { customerId },
      orderBy: [{ tranDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  let running = customer.openingBalance;
  const withBalance = entries.map((entry) => {
    running = running + entry.debit - entry.credit;
    return { ...entry, balance: running };
  });

  return withBalance.reverse();
}

export type LogCustomerPaymentInput = {
  customerId: string;
  date: Date;
  amount: number;
  remarks?: string;
};

/** Records money received from a customer: a ledger credit that lowers what they owe. */
export async function logCustomerPayment(data: LogCustomerPaymentInput) {
  if (!data.customerId) throw new Error("Customer is required");
  if (!Number.isFinite(data.amount) || data.amount <= 0)
    throw new Error("Amount must be a positive number");

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: data.customerId } });
    const tranNo = await getNextReceiptRef(tx);

    await tx.customerLedger.create({
      data: {
        tranDate: data.date,
        tranNo,
        tranType: "PAYMENT_RECEIVED",
        debit: 0,
        credit: data.amount,
        remarks: data.remarks?.trim() || `Payment from ${customer.name}`,
        customerId: data.customerId,
      },
    });

    await tx.customer.update({
      where: { id: data.customerId },
      data: { creditBalance: customer.creditBalance - data.amount },
    });
  });

  revalidatePath("/customers");
  revalidatePath("/");
}

/* ----------------------------- Pricing matrix ----------------------------- */

export type PricingMatrixRow = {
  name: string;
  supplierPrice: number;
  /** Aligned with `PricingMatrix.customerNames`; null means the cell was blank. */
  prices: (number | null)[];
};

export type PricingMatrix = {
  customerNames: string[];
  rows: PricingMatrixRow[];
};

export type PricingStrategy = "overwrite" | "keep";

const PRICE_EPSILON = 0.005;

/** One fetch of all products and customers, indexed by lowercase name. */
async function loadLookups() {
  const [products, customers] = await Promise.all([
    prisma.product.findMany({ select: { id: true, name: true, costPrice: true } }),
    prisma.customer.findMany({ select: { id: true, name: true } }),
  ]);

  // Product names are only unique per supplier, so a name can map to several.
  const productsByName = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.name.trim().toLowerCase();
    const list = productsByName.get(key);
    if (list) list.push(p);
    else productsByName.set(key, [p]);
  }

  const customersByName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c]));
  return { productsByName, customersByName };
}

function resolveProduct<T extends { costPrice: number }>(candidates: T[] | undefined, supplierPrice: number) {
  if (!candidates || candidates.length === 0) return null;
  return (
    candidates.find((p) => Math.abs(p.costPrice - supplierPrice) < PRICE_EPSILON) ?? candidates[0]
  );
}

/**
 * Dry run for the upload UI: reports what would not match and where the sheet's
 * SUPPLIER PRICE disagrees with the stored costPrice, so the user can choose
 * "overwrite" or "keep" before anything is written.
 */
export async function analyzePricingMatrix(matrix: PricingMatrix) {
  const { productsByName, customersByName } = await loadLookups();

  const unmatchedProducts: string[] = [];
  const mismatches: { name: string; excelPrice: number; dbPrice: number }[] = [];
  let matchedProducts = 0;

  for (const row of matrix.rows) {
    const product = resolveProduct(productsByName.get(row.name.trim().toLowerCase()), row.supplierPrice);
    if (!product) {
      unmatchedProducts.push(row.name);
      continue;
    }
    matchedProducts++;
    if (row.supplierPrice > 0 && Math.abs(product.costPrice - row.supplierPrice) >= PRICE_EPSILON) {
      mismatches.push({ name: row.name, excelPrice: row.supplierPrice, dbPrice: product.costPrice });
    }
  }

  const unknownCustomers = matrix.customerNames.filter(
    (n) => !customersByName.has(n.trim().toLowerCase())
  );

  return {
    totalRows: matrix.rows.length,
    matchedProducts,
    unmatchedProducts,
    unknownCustomers,
    mismatches,
  };
}

/**
 * Writes the matrix. Products, customers and existing prices are each fetched
 * once up front; the loop is purely in-memory and the writes go out as one
 * batch: createMany for new prices plus an update for each changed price.
 */
export async function bulkUpsertPricingMatrix(matrix: PricingMatrix, strategy: PricingStrategy) {
  const { productsByName, customersByName } = await loadLookups();
  const existingPrices = await prisma.customerPrice.findMany({
    select: { id: true, customerId: true, productId: true, customPrice: true },
  });
  const existingByKey = new Map(existingPrices.map((p) => [`${p.customerId}:${p.productId}`, p]));

  const customerIds = matrix.customerNames.map(
    (n) => customersByName.get(n.trim().toLowerCase())?.id ?? null
  );

  const unmatchedProducts: string[] = [];
  const costUpdates = new Map<string, number>();
  const creates = new Map<string, { customerId: string; productId: string; customPrice: number }>();
  const updates = new Map<string, { id: string; customPrice: number }>();

  for (const row of matrix.rows) {
    const product = resolveProduct(productsByName.get(row.name.trim().toLowerCase()), row.supplierPrice);
    if (!product) {
      unmatchedProducts.push(row.name);
      continue;
    }

    if (
      strategy === "overwrite" &&
      row.supplierPrice > 0 &&
      Math.abs(product.costPrice - row.supplierPrice) >= PRICE_EPSILON
    ) {
      costUpdates.set(product.id, row.supplierPrice);
    }

    row.prices.forEach((price, col) => {
      const customerId = customerIds[col];
      if (!customerId || price == null || !(price > 0)) return;

      const key = `${customerId}:${product.id}`;
      const existing = existingByKey.get(key);
      if (existing) {
        creates.delete(key);
        if (Math.abs(existing.customPrice - price) >= PRICE_EPSILON) {
          updates.set(key, { id: existing.id, customPrice: price });
        } else {
          updates.delete(key);
        }
      } else {
        creates.set(key, { customerId, productId: product.id, customPrice: price });
      }
    });
  }

  await prisma.$transaction([
    ...[...costUpdates].map(([id, costPrice]) =>
      prisma.product.update({ where: { id }, data: { costPrice } })
    ),
    ...(creates.size > 0
      ? [prisma.customerPrice.createMany({ data: [...creates.values()] })]
      : []),
    ...[...updates.values()].map((u) =>
      prisma.customerPrice.update({ where: { id: u.id }, data: { customPrice: u.customPrice } })
    ),
  ]);

  revalidatePath("/customers");
  revalidatePath("/inventory");

  return {
    pricesCreated: creates.size,
    pricesUpdated: updates.size,
    productsUpdated: costUpdates.size,
    unmatchedProducts,
    unknownCustomers: matrix.customerNames.filter((_, i) => !customerIds[i]),
  };
}

/** The products a customer has a custom price for (set via the pricing matrix upload). */
export async function getCustomerPrices(customerId: string) {
  const prices = await prisma.customerPrice.findMany({
    where: { customerId },
    select: {
      id: true,
      customPrice: true,
      product: { select: { productID: true, name: true, category: true } },
    },
  });

  return prices
    .map((p) => ({
      id: p.id,
      productID: p.product.productID,
      name: p.product.name,
      category: p.product.category,
      price: p.customPrice,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

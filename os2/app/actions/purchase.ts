"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseInvoiceRows } from "@/lib/parseInvoiceExcel";
import { getNextInvoiceNo, getNextProductID } from "@/lib/idGenerator";

type ResolvedPurchaseItem = {
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type TxClient = Prisma.TransactionClient;

/**
 * Finds a product by name within a supplier's catalog, or creates one with an
 * auto-generated PROD-XXXXX product ID. Shared by manual entry, Excel ingestion,
 * so a product name always resolves to the same underlying record across both.
 */
async function resolveProduct(
  tx: TxClient,
  params: { name: string; category?: string | null; costPrice: number; supplierId: string }
) {
  const existing = await tx.product.findFirst({
    where: {
      name: { equals: params.name, mode: "insensitive" },
      supplierId: params.supplierId,
    },
  });

  if (existing) return existing;

  const productID = await getNextProductID(tx);

  return tx.product.create({
    data: {
      productID,
      name: params.name,
      category: params.category ?? undefined,
      costPrice: params.costPrice,
      currentStock: 0,
      supplierId: params.supplierId,
    },
  });
}

/**
 * Shared final leg of both manual-entry and Excel-parsed purchases: creates the
 * invoice + line items, bumps stock with an audit trail, and posts the
 * supplier ledger debit — all within the caller's transaction. A debit here
 * means "amount added to what we owe the supplier" (invoice received); a
 * payment we make later is recorded as a credit that reduces the balance.
 */
async function postPurchaseInvoice(
  tx: TxClient,
  params: {
    supplierId: string;
    invoiceNo: string;
    invoiceDate: Date;
    resolvedItems: ResolvedPurchaseItem[];
  }
) {
  const supplier = await tx.supplier.findUniqueOrThrow({
    where: { id: params.supplierId },
  });

  const totalAmount = params.resolvedItems.reduce((sum, item) => sum + item.totalCost, 0);

  const invoice = await tx.purchaseInvoice.create({
    data: {
      invoiceNo: params.invoiceNo,
      invoiceDate: params.invoiceDate,
      totalAmount,
      status: "UNPAID",
      supplierId: params.supplierId,
      items: { create: params.resolvedItems },
    },
    include: { items: true },
  });

  for (const item of params.resolvedItems) {
    const product = await tx.product.update({
      where: { id: item.productId },
      data: { currentStock: { increment: item.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        movementType: "PURCHASE",
        quantity: item.quantity,
        previousStock: product.currentStock - item.quantity,
        newStock: product.currentStock,
        referenceNo: invoice.invoiceNo,
      },
    });
  }

  const newBalance = supplier.outstandingBalance + totalAmount;

  await tx.supplierLedger.create({
    data: {
      tranDate: params.invoiceDate,
      tranNo: invoice.invoiceNo,
      tranType: "PURCHASE_INVOICE",
      debit: totalAmount,
      credit: 0,
      balance: newBalance,
      remarks: `Purchase invoice ${invoice.invoiceNo}`,
      supplierId: params.supplierId,
    },
  });

  await tx.supplier.update({
    where: { id: params.supplierId },
    data: { outstandingBalance: newBalance },
  });

  return invoice;
}

function revalidatePurchaseRoutes() {
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export type CreatePurchaseInvoiceInput = {
  supplierId: string;
  invoiceDate: Date;
  items: {
    name: string;
    category?: string;
    costPrice: number;
    quantity: number;
  }[];
};

export async function createPurchaseInvoice(data: CreatePurchaseInvoiceInput) {
  if (!data.supplierId) throw new Error("Supplier is required");
  if (!data.items?.length) throw new Error("At least one line item is required");

  for (const item of data.items) {
    if (!item.name?.trim()) throw new Error("Every line item requires a product name");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      throw new Error(`Invalid quantity for ${item.name}`);
    if (!Number.isFinite(item.costPrice) || item.costPrice < 0)
      throw new Error(`Invalid unit cost for ${item.name}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const resolvedItems: ResolvedPurchaseItem[] = [];

    for (const item of data.items) {
      const product = await resolveProduct(tx, {
        name: item.name.trim(),
        category: item.category,
        costPrice: item.costPrice,
        supplierId: data.supplierId,
      });

      resolvedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost: item.costPrice,
        totalCost: item.quantity * item.costPrice,
      });
    }

    const invoiceNo = await getNextInvoiceNo(tx);

    return postPurchaseInvoice(tx, {
      supplierId: data.supplierId,
      invoiceNo,
      invoiceDate: data.invoiceDate,
      resolvedItems,
    });
  });

  revalidatePurchaseRoutes();

  return result;
}

export type ParseExcelInvoiceResult = {
  invoiceNo: string;
  itemCount: number;
  totalAmount: number;
};

/**
 * Parses a locally-uploaded supplier Excel invoice (.xlsx/.xls) and books it
 * exactly like a manually entered purchase invoice. Entirely local — no
 * external services are called.
 */
export async function parseAndCreatePurchaseInvoice(
  formData: FormData
): Promise<ParseExcelInvoiceResult> {
  const file = formData.get("file");
  const supplierId = formData.get("supplierId");
  const invoiceDateRaw = formData.get("invoiceDate");

  if (!(file instanceof File)) throw new Error("No Excel file was provided");
  if (typeof supplierId !== "string" || !supplierId)
    throw new Error("Select which supplier this invoice belongs to");
  if (!/\.(xlsx|xls)$/i.test(file.name))
    throw new Error("Only .xlsx or .xls files are supported");
  if (typeof invoiceDateRaw !== "string" || !invoiceDateRaw)
    throw new Error("Invoice date is required");

  const invoiceDate = new Date(invoiceDateRaw);
  if (Number.isNaN(invoiceDate.getTime())) throw new Error("Invalid invoice date");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The uploaded file has no sheets");

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const parsed = parseInvoiceRows(rows);

  const result = await prisma.$transaction(async (tx) => {
    const resolvedItems: ResolvedPurchaseItem[] = [];

    for (const item of parsed.items) {
      const product = await resolveProduct(tx, {
        name: item.productName,
        category: item.category,
        costPrice: item.unitCost,
        supplierId,
      });

      resolvedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.lineTotal,
      });
    }

    const invoiceNo = await getNextInvoiceNo(tx);

    return postPurchaseInvoice(tx, {
      supplierId,
      invoiceNo,
      invoiceDate,
      resolvedItems,
    });
  });

  revalidatePurchaseRoutes();

  return {
    invoiceNo: result.invoiceNo,
    itemCount: result.items.length,
    totalAmount: result.totalAmount,
  };
}

export async function deletePurchaseInvoice(invoiceId: string) {
  if (!invoiceId) throw new Error("Invoice id is required");

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true },
    });

    for (const item of invoice.items) {
      const product = await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: { decrement: item.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          movementType: "ADJUSTMENT",
          quantity: -item.quantity,
          previousStock: product.currentStock + item.quantity,
          newStock: product.currentStock,
          referenceNo: `${invoice.invoiceNo} (deleted)`,
        },
      });
    }

    await tx.supplierLedger.deleteMany({
      where: {
        supplierId: invoice.supplierId,
        tranNo: invoice.invoiceNo,
        tranType: "PURCHASE_INVOICE",
      },
    });

    await tx.supplier.update({
      where: { id: invoice.supplierId },
      data: { outstandingBalance: { decrement: invoice.totalAmount } },
    });

    // PurchaseItem rows cascade-delete with the invoice (onDelete: Cascade in schema).
    await tx.purchaseInvoice.delete({ where: { id: invoiceId } });
  });

  revalidatePurchaseRoutes();
}

export type UpdatePurchaseInvoiceItemInput = {
  itemId: string;
  quantity: number;
  costPrice: number;
};

export async function updatePurchaseInvoice(
  invoiceId: string,
  items: UpdatePurchaseInvoiceItemInput[]
) {
  if (!invoiceId) throw new Error("Invoice id is required");
  if (!items?.length)
    throw new Error(
      "An invoice must keep at least one line item — delete the invoice instead if none should remain"
    );

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      throw new Error("Quantity must be a positive number");
    if (!Number.isFinite(item.costPrice) || item.costPrice < 0)
      throw new Error("Unit cost must be zero or a positive number");
  }

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true },
    });

    const keptItemIds = new Set(items.map((i) => i.itemId));
    const removedItems = invoice.items.filter((existing) => !keptItemIds.has(existing.id));

    for (const removed of removedItems) {
      const product = await tx.product.update({
        where: { id: removed.productId },
        data: { currentStock: { decrement: removed.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId: removed.productId,
          movementType: "ADJUSTMENT",
          quantity: -removed.quantity,
          previousStock: product.currentStock + removed.quantity,
          newStock: product.currentStock,
          referenceNo: `${invoice.invoiceNo} (line removed)`,
        },
      });

      await tx.purchaseItem.delete({ where: { id: removed.id } });
    }

    let newTotalAmount = 0;

    for (const update of items) {
      const existingItem = invoice.items.find((i) => i.id === update.itemId);
      if (!existingItem) throw new Error("Line item not found on this invoice");

      const quantityDelta = update.quantity - existingItem.quantity;
      const newTotalCost = update.quantity * update.costPrice;
      newTotalAmount += newTotalCost;

      if (quantityDelta !== 0) {
        const product = await tx.product.update({
          where: { id: existingItem.productId },
          data: { currentStock: { increment: quantityDelta } },
        });

        await tx.stockMovement.create({
          data: {
            productId: existingItem.productId,
            movementType: "ADJUSTMENT",
            quantity: quantityDelta,
            previousStock: product.currentStock - quantityDelta,
            newStock: product.currentStock,
            referenceNo: `${invoice.invoiceNo} (edited)`,
          },
        });
      }

      await tx.purchaseItem.update({
        where: { id: update.itemId },
        data: {
          quantity: update.quantity,
          unitCost: update.costPrice,
          totalCost: newTotalCost,
        },
      });
    }

    const amountDelta = newTotalAmount - invoice.totalAmount;

    await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { totalAmount: newTotalAmount },
    });

    if (amountDelta !== 0) {
      const ledgerEntry = await tx.supplierLedger.findFirst({
        where: {
          supplierId: invoice.supplierId,
          tranNo: invoice.invoiceNo,
          tranType: "PURCHASE_INVOICE",
        },
      });

      if (ledgerEntry) {
        await tx.supplierLedger.update({
          where: { id: ledgerEntry.id },
          data: {
            debit: newTotalAmount,
            balance: ledgerEntry.balance + amountDelta,
          },
        });
      }

      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: { outstandingBalance: { increment: amountDelta } },
      });
    }
  });

  revalidatePurchaseRoutes();
}

export async function getPurchaseInvoices() {
  const invoices = await prisma.purchaseInvoice.findMany({
    include: {
      supplier: true,
      items: { include: { product: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });

  return invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    uploadDate: invoice.createdAt,
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    supplierName: invoice.supplier.name,
    itemCount: invoice.items.length,
    items: invoice.items.map((item) => ({
      id: item.id,
      productID: item.product.productID,
      productName: item.product.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.totalCost,
    })),
  }));
}

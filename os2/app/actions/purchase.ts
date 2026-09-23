"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseInvoiceRows } from "@/lib/parseInvoiceExcel";

type ResolvedPurchaseItem = {
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type TxClient = Prisma.TransactionClient;

/**
 * Shared final leg of both manual-entry and Excel-parsed purchases: creates the
 * invoice + line items, bumps stock with an audit trail, and posts the
 * supplier ledger credit — all within the caller's transaction.
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
      debit: 0,
      credit: totalAmount,
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
  invoiceNo: string;
  invoiceDate: Date;
  items: {
    productId?: string;
    sku: string;
    name: string;
    costPrice: number;
    quantity: number;
  }[];
};

export async function createPurchaseInvoice(data: CreatePurchaseInvoiceInput) {
  if (!data.supplierId) throw new Error("Supplier is required");
  if (!data.invoiceNo?.trim()) throw new Error("Invoice number is required");
  if (!data.items?.length) throw new Error("At least one line item is required");

  for (const item of data.items) {
    if (!item.sku?.trim()) throw new Error("Every line item requires a SKU");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      throw new Error(`Invalid quantity for SKU ${item.sku}`);
    if (!Number.isFinite(item.costPrice) || item.costPrice < 0)
      throw new Error(`Invalid unit cost for SKU ${item.sku}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const resolvedItems: ResolvedPurchaseItem[] = [];

    for (const item of data.items) {
      const product = await tx.product.upsert({
        where: { sku: item.sku },
        update: {},
        create: {
          sku: item.sku,
          name: item.name || item.sku,
          costPrice: item.costPrice,
          currentStock: 0,
          supplierId: data.supplierId,
        },
      });

      resolvedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost: item.costPrice,
        totalCost: item.quantity * item.costPrice,
      });
    }

    return postPurchaseInvoice(tx, {
      supplierId: data.supplierId,
      invoiceNo: data.invoiceNo.trim(),
      invoiceDate: data.invoiceDate,
      resolvedItems,
    });
  });

  revalidatePurchaseRoutes();

  return result;
}

function slugifySku(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `XLS-${slug || "ITEM"}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

const GENERIC_FILENAME_RE = /^(invoice|untitled|document|export|download)\b/i;

function deriveInvoiceNo(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const looksLikeReference = /[A-Za-z]{2,}[-_ ]?\d{2,}|\d{4,}/.test(base);

  if (base && !GENERIC_FILENAME_RE.test(base) && looksLikeReference) {
    const cleaned = base.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (cleaned) return cleaned;
  }

  return `PINV-${Date.now()}`;
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

  if (!(file instanceof File)) throw new Error("No Excel file was provided");
  if (typeof supplierId !== "string" || !supplierId)
    throw new Error("Select which supplier this invoice belongs to");
  if (!/\.(xlsx|xls)$/i.test(file.name))
    throw new Error("Only .xlsx or .xls files are supported");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The uploaded file has no sheets");

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const parsed = parseInvoiceRows(rows);
  const invoiceNo = deriveInvoiceNo(file.name);
  const invoiceDate = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const resolvedItems: ResolvedPurchaseItem[] = [];

    for (const item of parsed.items) {
      let product = await tx.product.findFirst({
        where: { name: { equals: item.productName, mode: "insensitive" }, supplierId },
      });

      if (!product) {
        product = await tx.product.create({
          data: {
            sku: slugifySku(item.productName),
            name: item.productName,
            category: item.category ?? undefined,
            costPrice: item.unitCost,
            currentStock: 0,
            supplierId,
          },
        });
      }

      resolvedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.lineTotal,
      });
    }

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
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    supplierName: invoice.supplier.name,
    itemCount: invoice.items.length,
    items: invoice.items.map((item) => ({
      id: item.id,
      sku: item.product.sku,
      productName: item.product.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.totalCost,
    })),
  }));
}

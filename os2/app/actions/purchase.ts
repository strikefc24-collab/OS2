"use server";

import { revalidatePath } from "next/cache";
import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseInvoiceText } from "@/lib/parseInvoice";

type ResolvedPurchaseItem = {
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type TxClient = Prisma.TransactionClient;

/**
 * Shared final leg of both manual-entry and PDF-parsed purchases: creates the
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
  return `PDF-${slug || "ITEM"}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export type ParsePdfInvoiceResult = {
  invoiceNo: string;
  itemCount: number;
  totalAmount: number;
};

/**
 * Parses a locally-uploaded, digitally-generated purchase invoice PDF (no OCR —
 * the source system must produce a real text layer) and books it exactly like
 * a manually entered purchase invoice.
 */
export async function parseAndCreatePurchaseInvoice(
  formData: FormData
): Promise<ParsePdfInvoiceResult> {
  const file = formData.get("file");
  const supplierId = formData.get("supplierId");

  if (!(file instanceof File)) throw new Error("No PDF file was provided");
  if (typeof supplierId !== "string" || !supplierId)
    throw new Error("Select which supplier this invoice belongs to");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("Only PDF files are supported");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const parser = new PDFParse({ data: buffer });
  let rawText: string;
  try {
    const textResult = await parser.getText();
    rawText = textResult.text;
  } finally {
    await parser.destroy();
  }

  if (!rawText.trim()) {
    throw new Error(
      "No text could be extracted from this PDF. It may be a scanned or image-only file — this ingestion engine only reads digitally generated PDFs, not scans."
    );
  }

  const parsed = parseInvoiceText(rawText);

  if (parsed.items.length === 0) {
    throw new Error(
      "No line items could be recognized in this PDF. The table layout may not match the expected format."
    );
  }

  const invoiceNo = parsed.invoiceNo ?? `PDF-${Date.now()}`;
  const invoiceDate = parsed.invoiceDate ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    const resolvedItems: ResolvedPurchaseItem[] = [];

    for (const item of parsed.items) {
      let product = await tx.product.findFirst({
        where: { name: { equals: item.productName, mode: "insensitive" } },
      });

      if (!product) {
        product = await tx.product.create({
          data: {
            sku: slugifySku(item.productName),
            name: item.productName,
            category: item.category ?? undefined,
            costPrice: item.unitPrice,
            currentStock: 0,
            supplierId,
          },
        });
      }

      resolvedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost: item.unitPrice,
        totalCost: item.lineTotal ?? item.quantity * item.unitPrice,
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

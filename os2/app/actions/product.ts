"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNextProductID } from "@/lib/idGenerator";

function revalidateProductRoutes() {
  revalidatePath("/inventory");
  revalidatePath("/purchases");
  revalidatePath("/");
}

export async function getProducts() {
  return prisma.product.findMany({
    orderBy: { name: "asc" },
  });
}

export type CreateProductInput = {
  name: string;
  category?: string;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  supplierId?: string;
};

export async function createProduct(data: CreateProductInput) {
  if (!data.name?.trim()) throw new Error("Product name is required");
  if (!Number.isFinite(data.costPrice) || data.costPrice < 0)
    throw new Error("Cost price must be zero or a positive number");
  if (!Number.isFinite(data.sellingPrice) || data.sellingPrice < 0)
    throw new Error("Selling price must be zero or a positive number");
  if (!Number.isFinite(data.currentStock) || data.currentStock < 0)
    throw new Error("Starting stock must be zero or a positive number");

  const productID = await getNextProductID(prisma);

  const product = await prisma.product.create({
    data: {
      productID,
      name: data.name.trim(),
      category: data.category?.trim() || undefined,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      currentStock: data.currentStock,
      supplierId: data.supplierId || undefined,
    },
  });

  revalidateProductRoutes();

  return product;
}

export type UpdateProductInput = {
  id: string;
  name: string;
  category?: string;
  costPrice: number;
  sellingPrice: number;
  supplierId?: string;
};

export async function updateProduct(data: UpdateProductInput) {
  if (!data.id) throw new Error("Product id is required");
  if (!data.name?.trim()) throw new Error("Product name is required");
  if (!Number.isFinite(data.costPrice) || data.costPrice < 0)
    throw new Error("Cost price must be zero or a positive number");
  if (!Number.isFinite(data.sellingPrice) || data.sellingPrice < 0)
    throw new Error("Selling price must be zero or a positive number");

  const product = await prisma.product.update({
    where: { id: data.id },
    data: {
      name: data.name.trim(),
      category: data.category?.trim() || null,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      supplierId: data.supplierId || null,
    },
  });

  revalidateProductRoutes();

  return product;
}

export async function deleteProduct(id: string) {
  if (!id) throw new Error("Product id is required");

  const linkedItemCount = await prisma.purchaseItem.count({
    where: { productId: id },
  });

  if (linkedItemCount > 0) {
    throw new Error(
      `Cannot delete this product — it is linked to ${linkedItemCount} purchase invoice line item(s).`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  revalidateProductRoutes();
}

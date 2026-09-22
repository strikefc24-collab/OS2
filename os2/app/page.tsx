import { prisma } from "@/lib/prisma";
import { ShoppingCart, Wallet, Boxes, Package } from "lucide-react";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

async function getDashboardMetrics() {
  const [purchaseTotal, supplierOutstanding, products] = await Promise.all([
    prisma.purchaseInvoice.aggregate({ _sum: { totalAmount: true } }),
    prisma.supplier.aggregate({ _sum: { outstandingBalance: true } }),
    prisma.product.findMany({ select: { currentStock: true, costPrice: true } }),
  ]);

  const stockValue = products.reduce(
    (sum, p) => sum + p.currentStock * p.costPrice,
    0
  );

  return {
    totalPurchases: purchaseTotal._sum.totalAmount ?? 0,
    supplierOutstanding: supplierOutstanding._sum.outstandingBalance ?? 0,
    stockValue,
    activeProducts: products.length,
  };
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  const cards = [
    {
      label: "Total Purchases",
      value: currency(metrics.totalPurchases),
      icon: ShoppingCart,
    },
    {
      label: "Supplier Outstanding",
      value: currency(metrics.supplierOutstanding),
      icon: Wallet,
    },
    {
      label: "Total Stock Value",
      value: currency(metrics.stockValue),
      icon: Boxes,
    },
    {
      label: "Total Active Products",
      value: metrics.activeProducts.toString(),
      icon: Package,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of purchasing and inventory activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{label}</span>
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

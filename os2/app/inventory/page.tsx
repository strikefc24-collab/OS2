import { getProducts } from "@/app/actions/product";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

export default async function InventoryPage() {
  const products = await getProducts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Inventory</h1>
        <p className="text-sm text-slate-500">
          Current stock levels and valuation across all products.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-slate-500">SKU</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Name</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Category</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Stock</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Cost Price</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Selling Price</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Stock Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No products yet. Create a purchase invoice to add stock.
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{p.sku}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{p.name}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{p.category ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{p.currentStock}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{currency(p.costPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{currency(p.sellingPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {currency(p.currentStock * p.costPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

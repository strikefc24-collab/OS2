"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Package, Plus, Pencil, Trash2, Search } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { deleteProduct } from "@/app/actions/product";
import ProductModal from "@/components/ProductModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";

type Supplier = { id: string; name: string };

type Product = {
  id: string;
  productID: string;
  name: string;
  category: string | null;
  currentStock: number;
  costPrice: number;
  sellingPrice: number;
  supplierId: string | null;
};

export default function InventoryClient({
  products,
  suppliers,
}: {
  products: Product[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const totalStockValue = products.reduce((sum, p) => sum + p.currentStock * p.costPrice, 0);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) || p.productID.toLowerCase().includes(query)
    );
  }, [products, search]);

  const handleSaved = (message: string) => {
    setModalOpen(false);
    setEditingProduct(null);
    setToastMessage(message);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    await deleteProduct(deletingProduct.id);
    setToastMessage(`Product ${deletingProduct.productID} deleted.`);
    setDeletingProduct(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500">
            Current stock levels and valuation across all products.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus size={16} /> Add Product
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Total Products</span>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Package size={18} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">{products.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Total Stock Value</span>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Boxes size={18} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-800">{formatMoney(totalStockValue)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Products</h2>
          <div className="relative w-full sm:w-64">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or product ID"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Product ID</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Name</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Category</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Stock</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Cost Price</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Selling Price</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Stock Value</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                    {products.length === 0
                      ? "No products yet. Create a purchase invoice or add one manually."
                      : "No products match your search."}
                  </td>
                </tr>
              )}
              {filteredProducts.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{p.productID}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{p.name}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{p.category ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{p.currentStock}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatMoney(p.costPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatMoney(p.sellingPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {formatMoney(p.currentStock * p.costPrice)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="text-slate-400 hover:text-indigo-600"
                        aria-label="Edit product"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeletingProduct(p)}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label="Delete product"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ProductModal
          product={null}
          suppliers={suppliers}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {editingProduct && (
        <ProductModal
          product={editingProduct}
          suppliers={suppliers}
          onClose={() => setEditingProduct(null)}
          onSaved={handleSaved}
        />
      )}

      {deletingProduct && (
        <ConfirmDialog
          title="Delete this product?"
          message={`This permanently removes ${deletingProduct.productID} — ${deletingProduct.name}. Products linked to existing invoices can't be deleted.`}
          onCancel={() => setDeletingProduct(null)}
          onConfirm={handleDelete}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

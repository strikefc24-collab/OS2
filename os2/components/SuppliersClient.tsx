"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Wallet } from "lucide-react";
import { getSupplierLedger, getSupplierProducts } from "@/app/actions/supplier";
import { formatMoney } from "@/lib/format";
import ImportProductsModal from "@/components/ImportProductsModal";
import LogPaymentModal from "@/components/LogPaymentModal";
import Toast from "@/components/Toast";
import SearchInput from "@/components/SearchInput";
import Pagination, { paginate } from "@/components/Pagination";

type Supplier = {
  id: string;
  name: string;
  code: string;
  contact: string | null;
  email: string | null;
  outstandingBalance: number;
};

type SupplierProduct = {
  id: string;
  productID: string;
  name: string;
  category: string | null;
  costPrice: number;
};

type LedgerEntry = {
  id: string;
  tranDate: Date;
  tranNo: string;
  tranType: string;
  debit: number;
  credit: number;
  balance: number;
  remarks: string | null;
};

const TRAN_TYPE_LABELS: Record<string, string> = {
  PURCHASE_INVOICE: "Purchase Invoice",
  PAYMENT_MADE: "Payment Made",
};

type Tab = "products" | "ledger";

export default function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(suppliers[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [logPaymentOpen, setLogPaymentOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const productQuery = productSearch.trim().toLowerCase();
  const filteredProducts = productQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productQuery) ||
          p.productID.toLowerCase().includes(productQuery) ||
          (p.category ?? "").toLowerCase().includes(productQuery)
      )
    : products;
  const productView = paginate(filteredProducts, productPage);
  const ledgerView = paginate(ledger, ledgerPage);

  const selectedSupplier = suppliers.find((s) => s.id === selectedId) ?? null;

  const reload = async (supplierId: string) => {
    const [p, l] = await Promise.all([getSupplierProducts(supplierId), getSupplierLedger(supplierId)]);
    setProducts(p);
    setLedger(l);
  };

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [p, l] = await Promise.all([
          getSupplierProducts(selectedId),
          getSupplierLedger(selectedId),
        ]);
        if (!cancelled) {
          setProducts(p);
          setLedger(l);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleDone = (message: string) => {
    setImportOpen(false);
    setLogPaymentOpen(false);
    setToastMessage(message);
    router.refresh();
    if (selectedId) reload(selectedId);
  };

  const emptyRow = (colSpan: number, text: string) => (
    <tr>
      <td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-slate-500">
        {text}
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Suppliers</h1>
        <p className="text-sm text-slate-500">
          Product catalogs, pricing and ledger for each supplier.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="self-start rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-5 py-3 text-sm font-semibold text-slate-800">
            All Suppliers
          </div>
          <ul className="divide-y divide-slate-100">
            {suppliers.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-slate-500">No suppliers yet.</li>
            )}
            {suppliers.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setSelectedId(s.id);
                    setProductSearch("");
                    setProductPage(1);
                    setLedgerPage(1);
                  }}
                  className={`flex w-full flex-col px-5 py-3 text-left transition-colors ${
                    s.id === selectedId
                      ? "bg-indigo-50 border-l-2 border-indigo-500"
                      : "border-l-2 border-transparent hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-800">{s.name}</span>
                  <span className="text-xs text-slate-500">{s.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {!selectedSupplier ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Select a supplier to view their catalog.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{selectedSupplier.name}</h2>
                  <p className="text-xs text-slate-500">
                    {selectedSupplier.code} · {selectedSupplier.contact || "No contact"} ·{" "}
                    {selectedSupplier.email || "No email"} · Outstanding{" "}
                    {formatMoney(selectedSupplier.outstandingBalance)}
                  </p>
                </div>
                {tab === "products" ? (
                  <button
                    onClick={() => setImportOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                  >
                    <FileSpreadsheet size={16} /> Import Products (Excel)
                  </button>
                ) : (
                  <button
                    onClick={() => setLogPaymentOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    <Wallet size={16} /> Log Payment
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-200/80 px-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1">
                  {(["products", "ledger"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium capitalize ${
                        tab === t
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {tab === "products" && (
                  <div className="pb-2 sm:pb-0">
                    <SearchInput
                      value={productSearch}
                      onChange={(v) => {
                        setProductSearch(v);
                        setProductPage(1);
                      }}
                      placeholder="Search name, ID or category"
                    />
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                {tab === "products" ? (
                  <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium text-slate-500">Product ID</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Name</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Category</th>
                        <th className="px-3 py-3 text-right font-medium text-slate-500">Cost Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading && emptyRow(4, "Loading...")}
                      {!loading && products.length === 0 &&
                        emptyRow(4, `No products yet for ${selectedSupplier.name}.`)}
                      {!loading && products.length > 0 && filteredProducts.length === 0 &&
                        emptyRow(4, "No products match your search.")}
                      {!loading &&
                        productView.pageItems.map((p) => (
                          <tr key={p.id}>
                            <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">
                              {p.productID}
                            </td>
                            <td className="px-3 py-3 text-slate-700">{p.name}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                              {p.category || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                              {formatMoney(p.costPrice)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium text-slate-500">Date</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Tran No.</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Type</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Debit</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Credit</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Balance</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-500">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading && emptyRow(7, "Loading...")}
                      {!loading && ledger.length === 0 &&
                        emptyRow(7, `No transactions yet for ${selectedSupplier.name}.`)}
                      {!loading &&
                        ledgerView.pageItems.map((entry) => (
                          <tr key={entry.id}>
                            <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                              {new Date(entry.tranDate).toLocaleDateString()}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">
                              {entry.tranNo}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {TRAN_TYPE_LABELS[entry.tranType] ?? entry.tranType}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {entry.debit > 0 ? formatMoney(entry.debit) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {entry.credit > 0 ? formatMoney(entry.credit) : "—"}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-3 font-medium ${
                                entry.balance < 0 ? "text-indigo-600" : "text-slate-800"
                              }`}
                            >
                              {entry.balance < 0
                                ? `${formatMoney(Math.abs(entry.balance))} Cr`
                                : formatMoney(entry.balance)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                              {entry.remarks || "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
              {tab === "products" ? (
                <Pagination
                  total={filteredProducts.length}
                  page={productView.current}
                  onPageChange={setProductPage}
                />
              ) : (
                <Pagination
                  total={ledger.length}
                  page={ledgerView.current}
                  onPageChange={setLedgerPage}
                />
              )}
            </>
          )}
        </div>
      </div>

      {importOpen && selectedSupplier && (
        <ImportProductsModal
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          onClose={() => setImportOpen(false)}
          onImported={handleDone}
        />
      )}

      {logPaymentOpen && selectedSupplier && (
        <LogPaymentModal
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          onClose={() => setLogPaymentOpen(false)}
          onLogged={handleDone}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import PurchaseInvoiceModal from "@/components/PurchaseInvoiceModal";
import EditPurchaseInvoiceModal from "@/components/EditPurchaseInvoiceModal";
import UploadModal from "@/components/UploadModal";
import StatusBadge from "@/components/StatusBadge";
import Toast from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatMoney } from "@/lib/format";
import { deletePurchaseInvoice } from "@/app/actions/purchase";

type Supplier = { id: string; name: string; code: string };
type Product = { id: string; productID: string; name: string; costPrice: number };

type InvoiceItem = {
  id: string;
  productID: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  invoiceDate: Date;
  uploadDate: Date;
  totalAmount: number;
  status: string;
  supplierName: string;
  itemCount: number;
  items: InvoiceItem[];
};

export default function PurchasesClient({
  suppliers,
  products,
  invoices,
}: {
  suppliers: Supplier[];
  products: Product[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);

  const handleCreated = () => {
    setModalOpen(false);
    router.refresh();
  };

  const handleUploaded = (message: string) => {
    setUploadOpen(false);
    setToastMessage(message);
    router.refresh();
  };

  const handleUpdated = () => {
    setEditingInvoice(null);
    setToastMessage("Invoice updated.");
    router.refresh();
  };

  const handleDeletedFromEdit = () => {
    setEditingInvoice(null);
    setToastMessage("All items were removed, so the invoice was deleted.");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deletingInvoice) return;
    await deletePurchaseInvoice(deletingInvoice.id);
    setDeletingInvoice(null);
    setToastMessage(`Invoice ${deletingInvoice.invoiceNo} deleted.`);
    router.refresh();
  };

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter(
      (invoice) =>
        invoice.invoiceNo.toLowerCase().includes(query) ||
        invoice.supplierName.toLowerCase().includes(query)
    );
  }, [invoices, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Purchases</h1>
          <p className="text-sm text-slate-500">
            Record and track purchase invoices from your suppliers.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <UploadCloud size={16} /> Upload Excel Invoice
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={16} /> New Purchase Invoice
          </button>
        </div>
      </div>

      <button
        onClick={() => setUploadOpen(true)}
        className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <span className="rounded-full bg-blue-50 p-3 text-blue-700">
          <UploadCloud size={22} />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-700">
            Drag &amp; Drop Excel Invoice
          </p>
          <p className="text-xs text-slate-500">
            .xlsx / .xls invoices are parsed locally — no cloud APIs.
          </p>
        </div>
      </button>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Invoice History</h2>
          <div className="relative w-full sm:w-64">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no. or supplier"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-slate-500" />
                <th className="px-3 py-3 text-left font-medium text-slate-500">Invoice Date</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Upload Date</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Invoice No.</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Supplier</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Items</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Total</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                    {invoices.length === 0
                      ? "No purchase invoices yet."
                      : "No invoices match your search."}
                  </td>
                </tr>
              )}
              {filteredInvoices.map((invoice) => {
                const expanded = expandedId === invoice.id;
                return (
                  <Fragment key={invoice.id}>
                    <tr className="hover:bg-slate-50">
                      <td
                        className="cursor-pointer px-5 py-3 text-slate-400"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {expanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 text-slate-700"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 text-slate-500"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {new Date(invoice.uploadDate).toLocaleDateString()}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 font-medium text-slate-800"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {invoice.invoiceNo}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 text-slate-700"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {invoice.supplierName}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 text-slate-700"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {invoice.itemCount}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3 text-slate-700"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        {formatMoney(invoice.totalAmount)}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-3 py-3"
                        onClick={() => setExpandedId(expanded ? null : invoice.id)}
                      >
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingInvoice(invoice)}
                            className="text-slate-400 hover:text-indigo-600"
                            aria-label="Edit invoice"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingInvoice(invoice)}
                            className="text-slate-400 hover:text-rose-600"
                            aria-label="Delete invoice"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 px-5 py-4">
                          <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                            <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Product ID</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Product</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Qty</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Unit Cost</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Line Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {invoice.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 text-slate-700">{item.productID}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.productName}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                                    <td className="px-3 py-2 text-slate-700">{formatMoney(item.unitCost)}</td>
                                    <td className="px-3 py-2 text-slate-700">{formatMoney(item.totalCost)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="border-t border-slate-200/80 bg-slate-50 font-medium text-slate-800">
                                <tr>
                                  <td className="px-3 py-2" colSpan={2}>
                                    Total
                                  </td>
                                  <td className="px-3 py-2">
                                    {invoice.items.reduce((sum, item) => sum + item.quantity, 0)}
                                  </td>
                                  <td className="px-3 py-2" />
                                  <td className="px-3 py-2">
                                    {formatMoney(
                                      invoice.items.reduce((sum, item) => sum + item.totalCost, 0)
                                    )}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <PurchaseInvoiceModal
          suppliers={suppliers}
          products={products}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {uploadOpen && (
        <UploadModal
          suppliers={suppliers}
          onClose={() => setUploadOpen(false)}
          onCreated={handleUploaded}
        />
      )}

      {editingInvoice && (
        <EditPurchaseInvoiceModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeletedFromEdit}
        />
      )}

      {deletingInvoice && (
        <ConfirmDialog
          title="Delete this invoice?"
          message={`This reverses stock and the ledger balance for invoice ${deletingInvoice.invoiceNo}. This cannot be undone.`}
          onCancel={() => setDeletingInvoice(null)}
          onConfirm={handleDelete}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

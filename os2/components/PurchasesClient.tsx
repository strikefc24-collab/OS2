"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Plus, ChevronDown, ChevronRight } from "lucide-react";
import PurchaseInvoiceModal from "@/components/PurchaseInvoiceModal";
import UploadModal from "@/components/UploadModal";
import StatusBadge from "@/components/StatusBadge";
import Toast from "@/components/Toast";

type Supplier = { id: string; name: string; code: string };

type InvoiceItem = {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  invoiceDate: Date;
  totalAmount: number;
  status: string;
  supplierName: string;
  itemCount: number;
  items: InvoiceItem[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

export default function PurchasesClient({
  suppliers,
  invoices,
}: {
  suppliers: Supplier[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleCreated = () => {
    setModalOpen(false);
    router.refresh();
  };

  const handleUploaded = (message: string) => {
    setUploadOpen(false);
    setToastMessage(message);
    router.refresh();
  };

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
            <UploadCloud size={16} /> Upload PDF Invoice
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
            Upload Team X Invoice PDF
          </p>
          <p className="text-xs text-slate-500">
            Digitally generated PDFs are parsed locally — no cloud APIs, no OCR.
          </p>
        </div>
      </button>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Invoice History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-slate-500" />
                <th className="px-3 py-3 text-left font-medium text-slate-500">Date</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Invoice No.</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Supplier</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Items</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Total</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No purchase invoices yet.
                  </td>
                </tr>
              )}
              {invoices.map((invoice) => {
                const expanded = expandedId === invoice.id;
                return (
                  <Fragment key={invoice.id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() =>
                        setExpandedId(expanded ? null : invoice.id)
                      }
                    >
                      <td className="px-5 py-3 text-slate-400">
                        {expanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">
                        {invoice.invoiceNo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {invoice.supplierName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {invoice.itemCount}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {currency(invoice.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusBadge status={invoice.status} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-5 py-4">
                          <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                            <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">SKU</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Product</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Qty</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Unit Cost</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-500">Line Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {invoice.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.productName}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                                    <td className="px-3 py-2 text-slate-700">{currency(item.unitCost)}</td>
                                    <td className="px-3 py-2 text-slate-700">{currency(item.totalCost)}</td>
                                  </tr>
                                ))}
                              </tbody>
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

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

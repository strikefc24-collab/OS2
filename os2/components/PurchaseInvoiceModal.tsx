"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { createPurchaseInvoice } from "@/app/actions/purchase";

type Supplier = { id: string; name: string; code: string };

type LineItem = {
  sku: string;
  name: string;
  quantity: string;
  costPrice: string;
};

function emptyLine(): LineItem {
  return { sku: "", name: "", quantity: "1", costPrice: "0" };
}

export default function PurchaseInvoiceModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (index: number, patch: Partial<LineItem>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const total = lines.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (Number(line.costPrice) || 0),
    0
  );

  const handleSubmit = async () => {
    setError(null);
    if (!supplierId) {
      setError("Select a supplier");
      return;
    }
    if (!invoiceNo.trim()) {
      setError("Invoice number is required");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line item");
      return;
    }

    setSubmitting(true);
    try {
      await createPurchaseInvoice({
        supplierId,
        invoiceNo: invoiceNo.trim(),
        invoiceDate: new Date(invoiceDate),
        items: lines.map((line) => ({
          sku: line.sku.trim(),
          name: line.name.trim(),
          quantity: Number(line.quantity) || 0,
          costPrice: Number(line.costPrice) || 0,
        })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            New Purchase Invoice
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Supplier
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {suppliers.length === 0 && <option value="">No suppliers</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Invoice No.
              </label>
              <input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="INV-0001"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                Line Items
              </span>
              <button
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Plus size={14} /> Add row
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200/80">
              <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">SKU</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Product Name</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unit Cost</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Line Total</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          value={line.sku}
                          onChange={(e) => updateLine(i, { sku: e.target.value })}
                          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={line.name}
                          onChange={(e) => updateLine(i, { name: e.target.value })}
                          className="w-40 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: e.target.value })}
                          className="w-16 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.costPrice}
                          onChange={(e) => updateLine(i, { costPrice: e.target.value })}
                          className="w-20 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {(
                          (Number(line.quantity) || 0) * (Number(line.costPrice) || 0)
                        ).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeLine(i)}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label="Remove row"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex justify-end text-sm font-medium text-slate-700">
              Total: {total.toFixed(2)}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

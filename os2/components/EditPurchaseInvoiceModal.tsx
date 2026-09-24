"use client";

import { useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { updatePurchaseInvoice, deletePurchaseInvoice } from "@/app/actions/purchase";
import { formatMoney } from "@/lib/format";

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
  items: InvoiceItem[];
};

type EditableLine = {
  itemId: string;
  productName: string;
  quantity: string;
  costPrice: string;
};

export default function EditPurchaseInvoiceModal({
  invoice,
  onClose,
  onUpdated,
  onDeleted,
}: {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [lines, setLines] = useState<EditableLine[]>(
    invoice.items.map((item) => ({
      itemId: item.id,
      productName: item.productName,
      quantity: String(item.quantity),
      costPrice: String(item.unitCost),
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.costPrice) || 0),
    0
  );

  const allItemsRemoved = lines.length === 0;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (allItemsRemoved) {
        await deletePurchaseInvoice(invoice.id);
        onDeleted();
        return;
      }

      await updatePurchaseInvoice(
        invoice.id,
        lines.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity) || 0,
          costPrice: Number(line.costPrice) || 0,
        }))
      );
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invoice");
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
            Edit Invoice {invoice.invoiceNo}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-xs text-slate-500">
            Adjust quantities, unit cost, or remove lines below. Stock and the supplier
            ledger balance update automatically to reflect the difference.
          </p>

          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200/80">
              <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Product</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unit Cost</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Line Total</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, i) => (
                    <tr key={line.itemId}>
                      <td className="px-3 py-2 text-slate-700">{line.productName}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: e.target.value })}
                          className="w-20 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.costPrice}
                          onChange={(e) => updateLine(i, { costPrice: e.target.value })}
                          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {formatMoney((Number(line.quantity) || 0) * (Number(line.costPrice) || 0))}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeLine(i)}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label="Remove line item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allItemsRemoved ? (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                All items removed. Proceeding will delete the entire invoice — this reverses
                its stock and ledger balance and cannot be undone.
              </p>
            </div>
          ) : (
            <div className="flex justify-end text-sm font-medium text-slate-700">
              Total: {formatMoney(total)}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              allItemsRemoved ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {submitting
              ? "Saving..."
              : allItemsRemoved
                ? "Delete Invoice"
                : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

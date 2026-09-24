"use client";

import { useRef, useState } from "react";
import { X, UploadCloud, FileSpreadsheet } from "lucide-react";
import { parseAndCreatePurchaseInvoice } from "@/app/actions/purchase";
import { formatMoney } from "@/lib/format";

type Supplier = { id: string; name: string; code: string };

export default function UploadModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (candidate: File | undefined | null) => {
    if (!candidate) return;
    if (!/\.(xlsx|xls)$/i.test(candidate.name)) {
      setError("Only .xlsx or .xls files are supported");
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!file) {
      setError("Choose an Excel invoice to upload");
      return;
    }
    if (!supplierId) {
      setError("Select which supplier this invoice belongs to");
      return;
    }
    if (!invoiceDate) {
      setError("Invoice date is required");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("supplierId", supplierId);
      formData.append("invoiceDate", invoiceDate);

      const result = await parseAndCreatePurchaseInvoice(formData);
      onCreated(
        `Imported invoice ${result.invoiceNo} — ${result.itemCount} item(s), total ${formatMoney(
          result.totalAmount
        )}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse and import invoice");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Upload Excel Invoice</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                This invoice belongs to
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
                Invoice Date
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            The invoice file may reference a different supplier name — confirm which supplier
            record in System 2 this maps to.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {file ? (
              <>
                <span className="rounded-full bg-blue-50 p-3 text-blue-700">
                  <FileSpreadsheet size={20} />
                </span>
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-500">Click to choose a different file</p>
              </>
            ) : (
              <>
                <span className="rounded-full bg-blue-50 p-3 text-blue-700">
                  <UploadCloud size={20} />
                </span>
                <p className="text-sm font-medium text-slate-700">
                  Drag &amp; Drop Excel Invoice
                </p>
                <p className="text-xs text-slate-500">.xlsx or .xls files only</p>
              </>
            )}
          </div>

          {submitting && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Parsing Excel &amp; updating inventory...
            </p>
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
            disabled={submitting || !file || !invoiceDate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Parsing..." : "Parse & Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { X, UploadCloud, FileSpreadsheet } from "lucide-react";
import { bulkUpsertSupplierProducts } from "@/app/actions/supplier";
import {
  findDuplicateConflicts,
  parseSupplierRows,
  type DuplicateConflict,
} from "@/lib/parseSupplierExcel";
import { formatMoney } from "@/lib/format";

export default function ImportProductsModal({
  supplierId,
  supplierName,
  onClose,
  onImported,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<DuplicateConflict[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (candidate: File | undefined | null) => {
    if (!candidate) return;
    if (!/\.(xlsx|xls)$/i.test(candidate.name)) {
      setError("Only .xlsx or .xls files are supported");
      return;
    }
    setError(null);
    setConflicts([]);
    setFile(candidate);
  };

  const handleSubmit = async (skipConflictCheck = false) => {
    if (!file) return;
    setError(null);
    setSubmitting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const parsed = parseSupplierRows(rows);

      if (!skipConflictCheck) {
        const found = findDuplicateConflicts(parsed);
        if (found.length > 0) {
          setConflicts(found);
          return;
        }
      }

      const result = await bulkUpsertSupplierProducts(supplierId, parsed);
      onImported(`Imported ${result.created} new and updated ${result.updated} existing product(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import products");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Import Products — {supplierName}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-xs text-slate-500">
            The sheet needs a &quot;Description&quot; column and a Price column (the 2nd column).
            Existing products are matched by name and have their price updated; new names are added.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? "border-sky-400 bg-sky-50" : "border-slate-300 bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <span className="rounded-full bg-sky-50 p-3 text-sky-700">
              {file ? <FileSpreadsheet size={20} /> : <UploadCloud size={20} />}
            </span>
            <p className="text-sm font-medium text-slate-700">
              {file ? file.name : "Drag & Drop Excel Price List"}
            </p>
            <p className="text-xs text-slate-500">
              {file ? "Click to choose a different file" : ".xlsx or .xls files only"}
            </p>
          </div>

          {conflicts.length > 0 && (
            <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <p>
                {conflicts.length} product name(s) appear more than once with different prices.
                Only the last row for each name would be saved. Fix the sheet, or import anyway.
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {conflicts.map((c) => (
                  <li key={c.name}>
                    <span className="font-medium">{c.name}</span>:{" "}
                    {c.entries.map((e) => `row ${e.rowNumber} = ${formatMoney(e.price)}`).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
            onClick={() => handleSubmit(conflicts.length > 0)}
            disabled={submitting || !file}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? "Importing..." : conflicts.length > 0 ? "Import Anyway" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

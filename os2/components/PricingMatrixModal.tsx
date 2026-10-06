"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { X, UploadCloud, FileSpreadsheet, AlertTriangle } from "lucide-react";
import {
  analyzePricingMatrix,
  bulkUpsertPricingMatrix,
  type PricingMatrix,
  type PricingStrategy,
} from "@/app/actions/customer";
import { parsePricingMatrix } from "@/lib/parsePricingMatrix";
import { formatMoney } from "@/lib/format";

type Analysis = Awaited<ReturnType<typeof analyzePricingMatrix>>;
type Result = Awaited<ReturnType<typeof bulkUpsertPricingMatrix>>;

type Step =
  | { kind: "pick" }
  | { kind: "conflict"; matrix: PricingMatrix; analysis: Analysis }
  | { kind: "done"; result: Result };

const PREVIEW_LIMIT = 8;

function NameList({ names }: { names: string[] }) {
  return (
    <>
      {names.slice(0, PREVIEW_LIMIT).join(", ")}
      {names.length > PREVIEW_LIMIT && ` and ${names.length - PREVIEW_LIMIT} more`}
    </>
  );
}

export default function PricingMatrixModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const commit = async (matrix: PricingMatrix, strategy: PricingStrategy) => {
    setError(null);
    setBusy(true);
    try {
      const result = await bulkUpsertPricingMatrix(matrix, strategy);
      onUploaded(
        `Pricing matrix applied: ${result.pricesCreated} added, ${result.pricesUpdated} updated` +
          (result.productsUpdated > 0 ? `, ${result.productsUpdated} cost price(s) overwritten.` : ".")
      );
      setStep({ kind: "done", result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload pricing matrix");
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const matrix = parsePricingMatrix(rows, sheet);

      const analysis = await analyzePricingMatrix(matrix);
      if (analysis.mismatches.length === 0) {
        await commit(matrix, "keep");
      } else {
        setStep({ kind: "conflict", matrix, analysis });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read pricing matrix");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={busy ? undefined : onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Upload Pricing Matrix</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {step.kind === "pick" && (
            <>
              <p className="text-xs text-slate-500">
                Column 1 is ITEM NAME, column 2 is SUPPLIER PRICE, and every column after that is a
                customer name. Items and customers are matched by name; blank cells are skipped.
                Formulas must be pasted as values.
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
                  {file ? file.name : "Drag & Drop Pricing Matrix"}
                </p>
                <p className="text-xs text-slate-500">
                  {file ? "Click to choose a different file" : ".xlsx or .xls files only"}
                </p>
              </div>
            </>
          )}

          {step.kind === "conflict" && (
            <>
              <div className="flex gap-3 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>
                  {step.analysis.mismatches.length} item(s) have a SUPPLIER PRICE that differs from
                  the cost price stored in the system. Should the system cost prices be overwritten
                  with the sheet values, or kept as they are? Customer prices are uploaded either
                  way.
                </p>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Item</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">System</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">Sheet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {step.analysis.mismatches.map((m) => (
                      <tr key={m.name}>
                        <td className="px-3 py-1.5 text-slate-700">{m.name}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">
                          {formatMoney(m.dbPrice)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">
                          {formatMoney(m.excelPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step.kind === "done" && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-800">{step.result.pricesCreated}</span>{" "}
                price(s) added, <span className="font-medium text-slate-800">{step.result.pricesUpdated}</span>{" "}
                updated
                {step.result.productsUpdated > 0 &&
                  `, ${step.result.productsUpdated} product cost price(s) overwritten`}
                .
              </p>
              {step.result.unmatchedProducts.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  {step.result.unmatchedProducts.length} item(s) were not found in the system and
                  were skipped: <NameList names={step.result.unmatchedProducts} />.
                </p>
              )}
              {step.result.unknownCustomers.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  No customer named <NameList names={step.result.unknownCustomers} /> exists, so
                  those columns were skipped. Add the customer first, then upload again.
                </p>
              )}
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4">
          {step.kind === "pick" && (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={busy || !file}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {busy ? "Reading..." : "Upload"}
              </button>
            </>
          )}
          {step.kind === "conflict" && (
            <>
              <button
                onClick={() => commit(step.matrix, "keep")}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep System Prices
              </button>
              <button
                onClick={() => commit(step.matrix, "overwrite")}
                disabled={busy}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Overwrite With Sheet"}
              </button>
            </>
          )}
          {step.kind === "done" && (
            <button
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

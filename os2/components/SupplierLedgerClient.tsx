"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { getSupplierLedger } from "@/app/actions/supplier";
import { formatMoney } from "@/lib/format";
import LogPaymentModal from "@/components/LogPaymentModal";
import Toast from "@/components/Toast";

type Supplier = {
  id: string;
  name: string;
  code: string;
  contact: string | null;
  email: string | null;
  outstandingBalance: number;
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

export default function SupplierLedgerClient({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(suppliers[0]?.id ?? "");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [logPaymentOpen, setLogPaymentOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedId) ?? null,
    [suppliers, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const entries = await getSupplierLedger(selectedId);
        if (!cancelled) setLedger(entries);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleLogged = (message: string) => {
    setLogPaymentOpen(false);
    setToastMessage(message);
    router.refresh();
    if (selectedId) {
      getSupplierLedger(selectedId).then(setLedger);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Supplier Ledger</h1>
        <p className="text-sm text-slate-500">
          Outstanding balances and transaction history for each supplier.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Code</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Name</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Contact</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Email</th>
                <th className="px-3 py-3 text-left font-medium text-slate-500">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No suppliers yet.
                  </td>
                </tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{s.code}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{s.name}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{s.contact || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{s.email || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {formatMoney(s.outstandingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Ledger</h2>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {suppliers.length === 0 && <option value="">No suppliers</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setLogPaymentOpen(true)}
            disabled={!selectedSupplier}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Wallet size={16} /> Log Payment
          </button>
        </div>

        <div className="overflow-x-auto">
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
              {!selectedSupplier && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Select a supplier to view their ledger.
                  </td>
                </tr>
              )}
              {selectedSupplier && loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading...
                  </td>
                </tr>
              )}
              {selectedSupplier && !loading && ledger.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No transactions yet for {selectedSupplier.name}.
                  </td>
                </tr>
              )}
              {selectedSupplier &&
                !loading &&
                ledger.map((entry) => (
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
        </div>
      </div>

      {logPaymentOpen && selectedSupplier && (
        <LogPaymentModal
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          onClose={() => setLogPaymentOpen(false)}
          onLogged={handleLogged}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

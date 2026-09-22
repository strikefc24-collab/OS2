import { getSuppliers } from "@/app/actions/supplier";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Supplier Ledger</h1>
        <p className="text-sm text-slate-500">
          Outstanding balances owed to each supplier.
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
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{s.contact ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{s.email ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {currency(s.outstandingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

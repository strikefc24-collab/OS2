"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Plus, Search, Wallet } from "lucide-react";
import { getCustomerLedger, getCustomerPrices } from "@/app/actions/customer";
import SearchInput from "@/components/SearchInput";
import { formatMoney } from "@/lib/format";
import AddCustomerModal from "@/components/AddCustomerModal";
import LogCustomerPaymentModal from "@/components/LogCustomerPaymentModal";
import PricingMatrixModal from "@/components/PricingMatrixModal";
import Pagination, { paginate } from "@/components/Pagination";
import Toast from "@/components/Toast";

type Customer = {
  id: string;
  customerID: string;
  name: string;
  phone: string | null;
  address: string | null;
  creditBalance: number;
  openingBalance: number;
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

type CustomerPriceRow = {
  id: string;
  productID: string;
  name: string;
  category: string | null;
  price: number;
};

type Tab = "ledger" | "products";

const TRAN_TYPE_LABELS: Record<string, string> = {
  SALES_INVOICE: "Sales Invoice",
  PAYMENT_RECEIVED: "Payment Received",
};

export default function CustomersClient({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [tab, setTab] = useState<Tab>("ledger");
  const [prices, setPrices] = useState<CustomerPriceRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.customerID.toLowerCase().includes(query) ||
          (c.phone ?? "").toLowerCase().includes(query)
      )
    : customers;

  const ledgerView = paginate(ledger, ledgerPage);

  const productQuery = productSearch.trim().toLowerCase();
  const filteredPrices = productQuery
    ? prices.filter(
        (p) =>
          p.name.toLowerCase().includes(productQuery) ||
          p.productID.toLowerCase().includes(productQuery) ||
          (p.category ?? "").toLowerCase().includes(productQuery)
      )
    : prices;
  const priceView = paginate(filteredPrices, productPage);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [entries, customerPrices] = await Promise.all([
          getCustomerLedger(selectedId),
          getCustomerPrices(selectedId),
        ]);
        if (!cancelled) {
          setLedger(entries);
          setPrices(customerPrices);
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

  const handlePaymentLogged = (message: string) => {
    setPaymentOpen(false);
    setToastMessage(message);
    router.refresh();
    getCustomerLedger(selectedId).then(setLedger);
  };

  const handleCreated = (message: string, customerId: string) => {
    setAddOpen(false);
    setToastMessage(message);
    setSelectedId(customerId);
    setLedgerPage(1);
    router.refresh();
  };

  const emptyRow = (text: string, colSpan = 7) => (
    <tr>
      <td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-slate-500">
        {text}
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Customers</h1>
          <p className="text-sm text-slate-500">Customer profiles, ledgers and custom pricing.</p>
        </div>
        <button
          onClick={() => setMatrixOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          <FileSpreadsheet size={16} /> Upload Pricing Matrix
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <div className="self-start rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">All Customers</h2>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <Plus size={14} /> Add Customer
              </button>
            </div>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, ID or phone"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-slate-500">
                {customers.length === 0 ? "No customers yet." : "No customers match your search."}
              </li>
            )}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setSelectedId(c.id);
                    setLedgerPage(1);
                    setProductPage(1);
                    setProductSearch("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-l-2 px-5 py-3 text-left transition-colors ${
                    c.id === selectedId
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-slate-800">{c.name}</span>
                    <span className="text-xs text-slate-500">{c.customerID}</span>
                  </span>
                  <span className="text-xs text-slate-600">{formatMoney(c.creditBalance)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {!selectedCustomer ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Select a customer to view their profile and ledger.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{selectedCustomer.name}</h2>
                  <p className="text-xs text-slate-500">{selectedCustomer.customerID}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Contact</dt>
                      <dd className="text-slate-800">{selectedCustomer.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Address</dt>
                      <dd className="text-slate-800">{selectedCustomer.address || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Opening Balance</dt>
                      <dd className="text-slate-800">{formatMoney(selectedCustomer.openingBalance)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Credit Balance</dt>
                      <dd className="font-semibold text-slate-800">
                        {formatMoney(selectedCustomer.creditBalance)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <button
                  onClick={() => setPaymentOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Wallet size={16} /> Log Payment
                </button>
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-200/80 px-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1">
                  {(["ledger", "products"] as Tab[]).map((t) => (
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

              {tab === "products" ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-left font-medium text-slate-500">Product ID</th>
                          <th className="px-3 py-3 text-left font-medium text-slate-500">Name</th>
                          <th className="px-3 py-3 text-left font-medium text-slate-500">Category</th>
                          <th className="px-3 py-3 text-right font-medium text-slate-500">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading && emptyRow("Loading...", 4)}
                        {!loading && prices.length === 0 &&
                          emptyRow(
                            `No custom prices yet for ${selectedCustomer.name}. Upload a pricing matrix to add them.`,
                            4
                          )}
                        {!loading && prices.length > 0 && filteredPrices.length === 0 &&
                          emptyRow("No products match your search.", 4)}
                        {!loading &&
                          priceView.pageItems.map((p) => (
                            <tr key={p.id}>
                              <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">
                                {p.productID}
                              </td>
                              <td className="px-3 py-3 text-slate-700">{p.name}</td>
                              <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                                {p.category || "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                                {formatMoney(p.price)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    total={filteredPrices.length}
                    page={priceView.current}
                    onPageChange={setProductPage}
                  />
                </>
              ) : (
              <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium text-slate-500">Date</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-500">Tran No.</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-500">Type</th>
                      <th className="px-3 py-3 text-right font-medium text-slate-500">Debit</th>
                      <th className="px-3 py-3 text-right font-medium text-slate-500">Credit</th>
                      <th className="px-3 py-3 text-right font-medium text-slate-500">Balance</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-500">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && emptyRow("Loading...")}
                    {!loading && ledger.length === 0 &&
                      emptyRow(`No transactions yet for ${selectedCustomer.name}.`)}
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
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                            {entry.debit > 0 ? formatMoney(entry.debit) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                            {entry.credit > 0 ? formatMoney(entry.credit) : "—"}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-3 text-right font-medium ${
                              entry.balance < 0 ? "text-indigo-600" : "text-slate-800"
                            }`}
                          >
                            {formatMoney(entry.balance)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                            {entry.remarks || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={ledger.length}
                page={ledgerView.current}
                onPageChange={setLedgerPage}
              />
              </>
              )}
            </>
          )}
        </div>
      </div>

      {addOpen && <AddCustomerModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />}

      {paymentOpen && selectedCustomer && (
        <LogCustomerPaymentModal
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          onClose={() => setPaymentOpen(false)}
          onLogged={handlePaymentLogged}
        />
      )}

      {matrixOpen && (
        <PricingMatrixModal
          onClose={() => setMatrixOpen(false)}
          onUploaded={(message) => {
            setToastMessage(message);
            router.refresh();
            if (selectedId) getCustomerPrices(selectedId).then(setPrices);
          }}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}

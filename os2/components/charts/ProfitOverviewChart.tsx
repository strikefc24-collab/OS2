"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/lib/format";

type PurchaseRecord = { date: string; amount: number };
type Mode = "weekly" | "monthly";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Bucket = { label: string; matches: (date: Date) => boolean };

function buildMonthlyBuckets(count: number): Bucket[] {
  const now = new Date();
  return Array.from({ length: count }, (_, idx) => {
    const offset = count - 1 - idx;
    const bucketMonth = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return {
      label: MONTH_LABELS[bucketMonth.getMonth()],
      matches: (date: Date) =>
        date.getFullYear() === bucketMonth.getFullYear() &&
        date.getMonth() === bucketMonth.getMonth(),
    };
  });
}

function buildWeeklyBuckets(count: number): Bucket[] {
  const now = new Date();
  return Array.from({ length: count }, (_, idx) => {
    const offset = count - 1 - idx;
    const end = new Date(now);
    end.setDate(now.getDate() - offset * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return {
      label: `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}`,
      matches: (date: Date) => date >= start && date <= end,
    };
  });
}

/**
 * Revenue has no backing Sales model yet, so it is always exactly 0 — a real,
 * honest value meaning "not tracked yet," never an estimate. Profit is
 * therefore always 0 - purchases until real sales data exists.
 */
function buildSeries(purchases: PurchaseRecord[], mode: Mode) {
  const bucketCount = mode === "weekly" ? 8 : 6;
  const buckets = mode === "weekly" ? buildWeeklyBuckets(bucketCount) : buildMonthlyBuckets(bucketCount);
  const parsedPurchases = purchases.map((p) => ({ date: new Date(p.date), amount: p.amount }));

  return buckets.map((bucket) => {
    const purchasesTotal =
      Math.round(
        parsedPurchases
          .filter((p) => bucket.matches(p.date))
          .reduce((sum, p) => sum + p.amount, 0) * 100
      ) / 100;

    return {
      label: bucket.label,
      purchases: purchasesTotal,
      revenue: 0,
      profit: Math.round((0 - purchasesTotal) * 100) / 100,
    };
  });
}

export default function ProfitOverviewChart({ purchases }: { purchases: PurchaseRecord[] }) {
  const [mode, setMode] = useState<Mode>("monthly");
  const data = useMemo(() => buildSeries(purchases, mode), [purchases, mode]);
  const hasData = data.some((entry) => entry.purchases > 0);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Profit Overview</h2>
          <p className="text-xs text-slate-500">
            Revenue is not tracked yet (always 0) — shown against real purchase totals.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
          {(["weekly", "monthly"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setMode(option)}
              className={`rounded-md px-3 py-1 capitalize transition-colors ${
                mode === option ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(value: number) => formatMoney(value)}
              />
              <Tooltip
                formatter={(value) => formatMoney(Number(value))}
                contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenue" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" name="Purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            No Data
          </div>
        )}
      </div>
    </div>
  );
}

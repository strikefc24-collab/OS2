"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#6366f1", "#38bdf8"];

export default function EntityDistributionChart({
  supplierCount,
  customerCount,
}: {
  supplierCount: number;
  customerCount: number;
}) {
  const data = [
    { name: "Suppliers", value: supplierCount },
    { name: "Customers", value: customerCount },
  ];

  const hasData = data.some((entry) => entry.value > 0);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Entity Distribution</h2>
      <p className="text-xs text-slate-500">Suppliers vs. customers on record.</p>

      <div className="mt-2 h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => String(value)}
                contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
              />
              <Legend verticalAlign="bottom" height={32} iconType="circle" />
            </PieChart>
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

const STYLES: Record<string, string> = {
  PAID: "bg-indigo-50 text-indigo-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  UNPAID: "bg-rose-50 text-rose-700",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        STYLES[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}

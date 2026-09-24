"use client";

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

export default function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-lg">
      <span className="mt-0.5 text-indigo-600">
        <CheckCircle2 size={18} />
      </span>
      <p className="flex-1 text-sm text-slate-700">{message}</p>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

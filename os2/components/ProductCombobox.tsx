"use client";

import { useEffect, useRef, useState } from "react";

type Product = { id: string; productID: string; name: string; costPrice: number };

export default function ProductCombobox({
  products,
  value,
  onChange,
  onSelectProduct,
  placeholder,
}: {
  products: Product[];
  value: string;
  onChange: (name: string) => void;
  onSelectProduct?: (product: Product) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const matches = (
    query ? products.filter((p) => p.name.toLowerCase().includes(query)) : products
  ).slice(0, 8);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-48 rounded-md border border-slate-200 px-2 py-1 text-slate-800 focus:border-indigo-400 focus:outline-none"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.name);
                onSelectProduct?.(p);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-800">{p.name}</span>
              <span className="text-xs text-slate-400">{p.productID}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

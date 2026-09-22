"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Users,
  Receipt,
  Wallet,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/sales", label: "Sales", icon: Receipt, disabled: true },
  { href: "/customers", label: "Customer Ledger", icon: Users, disabled: true },
  { href: "/suppliers", label: "Supplier Ledger", icon: Users },
  { href: "/expenses", label: "Expenses & Petty Cash", icon: Wallet, disabled: true },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon, disabled }) => {
        const isActive = pathname === href;

        if (disabled) {
          return (
            <span
              key={href}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400"
              title="Coming soon"
            >
              <Icon size={18} />
              {label}
            </span>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 md:hidden">
        <span className="text-base font-semibold text-slate-800">OS2</span>
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex">
        <div className="border-b border-slate-200/80 px-5 py-5">
          <span className="text-lg font-semibold tracking-tight text-slate-800">OS2</span>
          <p className="text-xs text-slate-500">Retail Inventory System</p>
        </div>
        <NavLinks pathname={pathname} />
      </aside>

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-5">
              <div>
                <span className="text-lg font-semibold tracking-tight text-slate-800">OS2</span>
                <p className="text-xs text-slate-500">Retail Inventory System</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

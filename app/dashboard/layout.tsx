"use client";
import Link from "next/link";
import { useState } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex">
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-green-800 text-white p-4 flex justify-between items-center z-30">
        <h2 className="font-bold">🌾 Agri PWA</h2>
        <button onClick={() => setOpen(!open)} className="text-2xl">{open ? "✕" : "☰"}</button>
      </div>

      {/* Sidebar - 100vh FORCE */}
      <aside 
        style={{ height: "100vh" }}
        className={`
        w-64 bg-green-800 text-white p-5 flex flex-col z-20
        fixed top-0 left-0 bottom-0
        transition-transform duration-300
        md:sticky md:top-0
        ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <h2 className="font-bold text-xl mb-8 hidden md:block">🌾 Agri PWA</h2>
        
        <nav className="flex flex-col gap-2 mt-12 md:mt-0 flex-1">
          <Link href="/dashboard" onClick={() => setOpen(false)} className="hover:bg-green-700 p-2.5 rounded-lg">📊 Dashboard</Link>
          <Link href="/dashboard/products" onClick={() => setOpen(false)} className="hover:bg-green-700 p-2.5 rounded-lg">📦 Products</Link>
          <Link href="/dashboard/sales" onClick={() => setOpen(false)} className="hover:bg-green-700 p-2.5 rounded-lg">💰 Sales Point</Link>
          <Link href="/dashboard/sales/history" onClick={() => setOpen(false)} className="hover:bg-green-700 p-2.5 rounded-lg">📜 Sales History</Link>
        </nav>

        <div className="mt-auto">
          <Link href="/login" onClick={() => setOpen(false)} className="block bg-green-900 hover:bg-black/20 p-3 rounded-lg text-center text-sm">Logout</Link>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-10 md:hidden"></div>}

      {/* Main - margin left = sidebar width */}
      <main className="flex-1 md:ml-64 min-h-screen bg-gray-50 pt-16 md:pt-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
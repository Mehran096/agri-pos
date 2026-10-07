"use client";
import Link from "next/link";
import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { offlineDB } from "@/lib/offline-db";

function useIsOnline(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
      window.removeEventListener("online", cb);
      window.removeEventListener("offline", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => navigator.onLine, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);
  const isOnline = useIsOnline();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    let mounted = true;
    const updateCount = async () => {
      try {
        const salesPending = await offlineDB.sales.where("synced").equals(0).count();
        const productsPending = await offlineDB.products.where("synced").equals(0).count();
        if (mounted) setPendingCount(salesPending + productsPending);
      } catch {}
    };
    void updateCount();
    const interval = window.setInterval(() => { void updateCount(); }, 5000);
    window.addEventListener("online", updateCount);
    window.addEventListener("focus", updateCount);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("online", updateCount);
      window.removeEventListener("focus", updateCount);
    };
  }, [hasMounted]);

  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((p) =>!p), []);

  const isOffline = hasMounted &&!isOnline;

  return (
    <div className="min-h-dvh flex bg-gray-50">
      <div className="md:hidden fixed top-0 left-0 right-0 bg-green-800 text-white p-3.5 flex justify-between items-center z-30 h-14">
        <h2 className="font-bold text-[13px] flex items-center gap-2" suppressHydrationWarning>
          🌾 Agri PWA
          {hasMounted && isOffline && <span className="text-[9px] bg-amber-500 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
          {hasMounted && pendingCount > 0 && <span className="text-[9px] bg-blue-500 px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
        </h2>
        <button type="button" onClick={toggleMenu} className="text-[20px] w-8 h-8 grid place-items-center" aria-label="Toggle menu">
          {open? "✕" : "☰"}
        </button>
      </div>

      <aside className={`w-64 bg-green-800 text-white p-5 flex flex-col z-20 fixed md:sticky top-0 left-0 h-dvh md:h-screen shrink-0 transition-transform duration-300 ${open? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <h2 className="font-bold text-[16px] mb-6 hidden md:flex items-center gap-2" suppressHydrationWarning>
          🌾 Agri PWA
          {hasMounted && isOffline && <span className="text-[9px] bg-amber-500 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
        </h2>

        {hasMounted && pendingCount > 0 && (
          <div className="mb-4 bg-amber-900/40 border border-amber-700/50 text-amber-100 text-[11px] p-2 rounded-lg text-center" suppressHydrationWarning>
            {pendingCount} pending sync {isOffline? "• offline" : ""}
          </div>
        )}

        <nav className="flex flex-col gap-1 flex-1 mt-2 md:mt-0">
          <Link href="/dashboard" onClick={closeMenu} className="hover:bg-green-700 p-2.5 rounded-lg transition text-[13px]">📊 Dashboard</Link>
          <Link href="/dashboard/products" onClick={closeMenu} className="hover:bg-green-700 p-2.5 rounded-lg transition text-[13px]">📦 Products</Link>
          <Link href="/dashboard/sales" onClick={closeMenu} className="hover:bg-green-700 p-2.5 rounded-lg transition text-[13px]">💰 Sales Point</Link>
          <Link href="/dashboard/sales/history" onClick={closeMenu} className="hover:bg-green-700 p-2.5 rounded-lg transition text-[13px]">📜 Sales History</Link>
        </nav>

        <div className="mt-auto flex flex-col gap-2" suppressHydrationWarning>
          <div className="text-[10px] text-green-200/60 text-center">
            {hasMounted? (isOnline? "🟢 Online" : "🟡 Offline Mode") : "🟢 Online"}
          </div>
          <Link href="/login" onClick={closeMenu} className="block bg-green-900 hover:bg-black/20 p-2.5 rounded-lg text-center text-[13px] transition">
            Logout
          </Link>
        </div>
      </aside>

      {open && <button type="button" aria-label="Close menu" onClick={closeMenu} className="fixed inset-0 bg-black/50 z-10 md:hidden" />}

      <main className="flex-1 min-w-0 min-h-dvh bg-gray-50 pt-14 md:pt-0">
        <div className="p-3 sm:p-5 w-full max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
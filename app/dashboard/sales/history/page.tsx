"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { offlineDB } from "@/lib/offline-db";

type Sale = {
  _id: string;
  productName: string;
  quantity: number;
  quantityInSub?: number;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  price: number;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  discount: number;
  total: number;
  createdAt: string;
  localId?: string;
  synced?: number
};

type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];

function isDateInFilter(dateStr: string, filter: FilterType): boolean {
  if (filter === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0,0,0,0);
  if (filter === "today") return d >= startToday;
  if (filter === "yesterday") {
    const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate()-1);
    const endYesterday = new Date(startToday);
    return d >= startYesterday && d < endYesterday;
  }
  if (filter === "weekly") {
    const startWeek = new Date(now); startWeek.setDate(now.getDate()-7); startWeek.setHours(0,0,0,0);
    return d >= startWeek;
  }
  if (filter === "monthly") {
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= startMonth;
  }
  if (filter === "yearly") {
    const startYear = new Date(now.getFullYear(), 0, 1);
    return d >= startYear;
  }
  return true;
}

function useIsOnline(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);
    return () => {
      window.removeEventListener("online", callback);
      window.removeEventListener("offline", callback);
    };
  }, []);
  const getSnapshot = useCallback(() => window.navigator.onLine, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function SalesHistoryPage() {
  const isOnline = useIsOnline();
  const isOffline =!isOnline;

  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [profit, setProfit] = useState(0);
  const [buyTotal, setBuyTotal] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const loadData = useCallback(async (currentFilter: FilterType, currentSearch: string, currentPage: number, signal?: AbortSignal) => {
    if (currentPage === 1) setLoading(true);
    try {
      const offlineAll = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
      const offlineMapped: Sale[] = offlineAll
   .filter((o) => isDateInFilter(o.createdAt, currentFilter))
   .filter((o) =>!currentSearch || o.productName.toLowerCase().includes(currentSearch.toLowerCase()))
   .map((o) => ({
          _id: o.localId,
          productName: o.productName,
          quantity: o.quantity,
          quantityInSub: o.quantityInSub,
          unit: o.unit,
          subUnit: o.subUnit,
          qtyPerUnit: o.qtyPerUnit,
          isPartialSale: o.isPartialSale,
          pricePerSub: o.pricePerSub,
          price: o.sellPrice || o.price,
          buyPrice: o.buyPrice || 0,
          sellPrice: o.sellPrice || o.price,
          profit: o.profit || 0,
          discount: 0,
          total: o.total,
          createdAt: o.createdAt,
          localId: o.localId,
          synced: 0,
        }));

      setPendingCount(offlineAll.length);

      if (typeof window!== "undefined" &&!window.navigator.onLine) {
        const paged = offlineMapped.slice(0, 20);
        if (currentPage === 1) setSales(paged);
        else setSales((prev) => [...prev,...paged]);
        const t = offlineMapped.reduce((a,b) => a + b.total, 0);
        const p = offlineMapped.reduce((a,b) => a + (b.profit || 0), 0);
        setTotal(t);
        setProfit(p);
        setBuyTotal(t - p);
        setPagination({ page: 1, totalPages: 1, hasMore: offlineMapped.length > 20, totalCount: offlineMapped.length });
        return;
      }

      const res = await fetch(
        `/api/sales?filter=${currentFilter}&search=${encodeURIComponent(currentSearch)}&page=${currentPage}&limit=20`,
        { signal }
      );
      const data = (await res.json()) as { sales: Sale[]; total: number; profit: number; pagination: Pagination };

      if (currentPage === 1) {
        setSales([...offlineMapped,...data.sales]);
      } else {
        setSales((prev) => [...prev,...data.sales]);
      }
      const offlineTotal = currentPage === 1? offlineMapped.reduce((a,b) => a + b.total, 0) : 0;
      const offlineProfit = currentPage === 1? offlineMapped.reduce((a,b) => a + (b.profit || 0), 0) : 0;
      const finalTotal = data.total + offlineTotal;
      const finalProfit = (data.profit || 0) + offlineProfit;
      setTotal(finalTotal);
      setProfit(finalProfit);
      setBuyTotal(finalTotal - finalProfit);
      setPagination(data.pagination);
    } catch (err) {
      if ((err as Error).name!== "AbortError") console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(filter, search, page, controller.signal);
    return () => controller.abort();
  }, [filter, search, page, loadData]);

  const handleFilterChange = (f: FilterType) => {
    setFilter(f);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const grouped: Record<string, Sale[]> = {};
  sales.forEach((s) => {
    const date = new Date(s.createdAt).toLocaleDateString();
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(s);
  });

  const exportCSV = () => {
    const headers = "Date,Product,MainQty,SubQty,Unit,SubUnit,Partial,Buy,Sell,PricePerSub,Profit,Total,Status\n";
    const rows = sales.map((s) => {
      const main = s.quantity.toFixed(3);
      const sub = (s.quantityInSub?? 0).toString();
      return `${new Date(s.createdAt).toLocaleDateString()},${s.productName},${main},${sub},${s.unit||""},${s.subUnit||""},${s.isPartialSale?"YES":"NO"},${s.buyPrice},${s.sellPrice},${s.pricePerSub||0},${s.profit},${s.total},${s._id.startsWith("local_")?"OFFLINE":"SYNCED"}`;
    }).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `al-farooq-sales-${filter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center font-medium">
          📶 Offline - Showing {pendingCount} local sales
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4">
        <Link href="/dashboard" className="text-[11px] sm:text-sm text-gray-500 hover:text-green-700">← Back to Dashboard</Link>
        <div className="flex flex-col sm:flex-row justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="logo" width={32} height={32} className="w-8 h-8 rounded-full border" />
              <h1 className="text-[17px] sm:text-xl font-bold">Al-Farooq - Sales History</h1>
            </div>
            <p className="text-[11px] sm:text-[13px] text-gray-500 mt-1">{filter.toUpperCase()} • {pagination.totalCount + pendingCount} sales • Sell Rs.{total.toFixed(0)} • Buy Rs.{buyTotal.toFixed(0)} • Profit Rs.{profit.toFixed(0)} {pendingCount > 0 && `(${pendingCount} offline)`}</p>
             
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button onClick={exportCSV} className="bg-white border border-gray-200 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">📥 CSV</button>
            <Link href="/dashboard/sales" className="bg-green-700 text-white px-3.5 sm:px-5 py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">+ New Sale</Link>
          </div>
        </div>
      </div>

      <div className="bg-white p-2.5 sm:p-4 rounded-xl shadow-sm border border-gray-100 mb-4 flex flex-col gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => handleFilterChange(f)} className={`px-3 py-1.5 rounded-full text-[11px] sm:text-[13px] capitalize whitespace-nowrap ${filter === f? "bg-green-700 text-white" : "bg-gray-100"}`}>{f}</button>
          ))}
        </div>
        <input placeholder="🔍 Search product..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="border border-gray-200 p-2.5 rounded-lg w-full outline-none text-[12px] sm:text-[14px] focus:ring-2 focus:ring-green-700" />
      </div>

      {loading && page === 1? (
        <p className="text-center py-10 text-gray-400 text-[12px]">Loading history...</p>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {Object.keys(grouped).length === 0? (
            <p className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100 text-[12px] px-3">
              No sales for {filter} {search? `with "${search}"` : ""}
            </p>
          ) : (
            Object.entries(grouped).map(([date, daySales]) => {
              const dayTotal = daySales.reduce((sum, x) => sum + x.total, 0);
              const dayProfit = daySales.reduce((sum, x) => sum + (x.profit || 0), 0);
              const dayBuy = dayTotal - dayProfit;
              return (
                <div key={date} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-3 sm:px-5 py-2.5 flex justify-between border-b border-gray-100">
                    <span className="font-semibold text-[11px] sm:text-[13px]">{date} • {daySales.length} sales</span>
                    <span className="text-[11px] sm:text-[13px] font-bold"><span className="text-gray-500">Buy {dayBuy.toFixed(0)} → </span><span className="text-green-700">Rs.{dayTotal.toFixed(0)}</span> <span className="text-blue-600 ml-2">+{dayProfit.toFixed(0)}</span></span>
                  </div>
                  {daySales.map((s) => {
                    const buy = s.total - s.profit;
                    return (
                    <div key={s._id} className={`px-3 sm:px-5 py-2.5 flex justify-between text-[12px] sm:text-[13px] border-b border-gray-50 last:border-0 hover:bg-gray-50 ${s._id.startsWith("local_")? "bg-amber-50/50" : ""}`}>
                      <div className="pr-2 flex-1">
                        <p className="font-medium text-[12px] sm:text-[13px] leading-tight">
                          {s.productName} {s.isPartialSale? <span className="text-blue-600 font-bold"> {s.quantityInSub}{s.subUnit} = {s.quantity.toFixed(3)} {s.unit} </span> : <span className="text-gray-400"> x{s.quantity.toFixed(2)} {s.unit}</span>} <span className="text-gray-400 text-[10px]"> @Rs.{s.sellPrice}{s.isPartialSale? ` (${s.pricePerSub?.toFixed(2)}/${s.subUnit})` : ""}</span> {s._id.startsWith("local_") && <span className="ml-1 text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Buy Rs.{buy.toFixed(0)} (Rate {s.buyPrice}) • Sell Rs.{s.sellPrice} • Profit Rs.{s.profit.toFixed(0)} • {new Date(s.createdAt).toLocaleTimeString()} {s.isPartialSale? `• Partial ${s.qtyPerUnit}${s.subUnit}/${s.unit}` : ""}</p>
                      </div>
                      <span className="font-bold text-[12px] sm:text-[13px] shrink-0 ml-2 text-right">Rs.{s.total.toFixed(0)}<br/><span className="text-[10px] text-gray-400 font-normal">Buy {buy.toFixed(0)}</span><br/><span className="text-[10px] text-green-700 font-normal">+{s.profit.toFixed(0)}</span></span>
                    </div>
                  )})}
                </div>
              );
            })
          )}
          {pagination.hasMore && (
            <button onClick={() => setPage((p) => p + 1)} disabled={loading} className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[12px] font-medium disabled:opacity-50">
              {loading? "Loading..." : `Load More (${pagination.totalCount - sales.length} left)`}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 bg-green-700 text-white p-3.5 sm:p-5 rounded-xl flex justify-between items-center">
        <div>
          <p className="font-medium text-[12px] sm:text-[14px]">Al-Farooq • Total {filter} Revenue</p>
          <p className="text-[11px] opacity-80">Buy Rs.{buyTotal.toFixed(0)} • Profit Rs.{profit.toFixed(0)}</p>
        </div>
        <span className="text-[18px] sm:text-2xl font-bold">Rs.{total.toFixed(0)}</span>
      </div>
    </div>
  );
}
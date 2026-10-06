"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Sale = { _id: string; productName: string; quantity: number; price: number; total: number; createdAt: string };
type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (page === 1) setLoading(true);
      try {
        const res = await fetch(
          `/api/sales?filter=${filter}&search=${encodeURIComponent(search)}&page=${page}&limit=20`,
          { signal: controller.signal }
        );
        const data = (await res.json()) as { sales: Sale[]; total: number; pagination: Pagination };
        if (page === 1) setSales(data.sales);
        else setSales((prev) => [...prev,...data.sales]);
        setTotal(data.total);
        setPagination(data.pagination);
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [filter, search, page]);

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
    const headers = "Date,Product,Quantity,Price,Total\n";
    const rows = sales.map((s) => `${new Date(s.createdAt).toLocaleDateString()},${s.productName},${s.quantity},${s.price},${s.total}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${filter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {/* Header - compact */}
      <div className="flex flex-col gap-3 mb-4">
        <Link href="/dashboard" className="text-[11px] sm:text-sm text-gray-500 hover:text-green-600">← Back</Link>
        <div className="flex flex-col sm:flex-row justify-between gap-2.5">
          <div>
            <h1 className="text-[19px] sm:text-2xl font-bold">📜 Sales History</h1>
            <p className="text-[11px] sm:text-[13px] text-gray-500 mt-1">{filter.toUpperCase()} • {pagination.totalCount} • Rs. {total}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="bg-white border border-gray-200 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">📥 CSV</button>
            <Link href="/dashboard/sales" className="bg-green-600 text-white px-3.5 sm:px-5 py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">+ New Sale</Link>
          </div>
        </div>
      </div>

      {/* Filters + Search - small pills */}
      <div className="bg-white p-2.5 sm:p-4 rounded-xl shadow-sm border border-gray-100 mb-4 flex flex-col gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => handleFilterChange(f)} className={`px-3 py-1.5 rounded-full text-[11px] sm:text-[13px] capitalize whitespace-nowrap ${filter === f? "bg-green-600 text-white" : "bg-gray-100"}`}>{f}</button>
          ))}
        </div>
        <input placeholder="🔍 Search product..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="border border-gray-200 p-2.5 rounded-lg w-full outline-none text-[12px] sm:text-[14px] focus:ring-2 focus:ring-green-500" />
      </div>

      {loading && page === 1? (
        <p className="text-center py-10 text-gray-400 text-[12px]">Loading history...</p>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {Object.keys(grouped).length === 0? (
            <p className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100 text-[12px] px-3">
              No sales for {filter} {search? `with ${search}` : ""}
            </p>
          ) : (
            Object.entries(grouped).map(([date, daySales]) => (
              <div key={date} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-3 sm:px-5 py-2.5 flex justify-between border-b border-gray-100">
                  <span className="font-semibold text-[11px] sm:text-[13px]">{date}</span>
                  <span className="text-[11px] sm:text-[13px] font-bold text-green-600">Rs. {daySales.reduce((sum, x) => sum + x.total, 0)} • {daySales.length}</span>
                </div>
                {daySales.map((s) => (
                  <div key={s._id} className="px-3 sm:px-5 py-2.5 flex justify-between text-[12px] sm:text-[13px] border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <div className="pr-2">
                      <p className="font-medium text-[12px] sm:text-[13px] leading-tight">{s.productName} <span className="text-gray-400 text-[10px]">x{s.quantity}</span></p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(s.createdAt).toLocaleTimeString()} • Rs. {s.price}</p>
                    </div>
                    <span className="font-bold text-[12px] sm:text-[13px] shrink-0">Rs. {s.total}</span>
                  </div>
                ))}
              </div>
            ))
          )}
          {pagination.hasMore && (
            <button onClick={() => setPage((p) => p + 1)} disabled={loading} className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[12px] font-medium">
              {loading? "Loading..." : `Load More (${pagination.totalCount - sales.length} left)`}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 bg-green-600 text-white p-3.5 sm:p-5 rounded-xl flex justify-between items-center">
        <span className="font-medium text-[12px] sm:text-[14px]">Total {filter} Revenue</span>
        <span className="text-[18px] sm:text-2xl font-bold">Rs. {total}</span>
      </div>
    </div>
  );
}
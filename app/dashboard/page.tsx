"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { offlineDB } from "@/lib/offline-db";

type Product = { _id: string; name: string; price: number; buyPrice: number; sellPrice: number; stock: number; unit: string; localId?: string; synced?: number };
type Sale = { productName: string; quantity: number; total: number; profit: number; createdAt: string; localId?: string; synced?: number };
type ReportItem = { count: number; total: number; profit: number };
type Reports = { today: ReportItem; month: ReportItem; year: ReportItem; all: ReportItem };
type ProductsResponse = Product[] | { products: Product[] };

function fixProduct(p: Product): Product {
  const sell = p.sellPrice || p.price || 0;
  const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(sell * 0.82);
  return {...p, buyPrice: buy, sellPrice: sell || buy, price: sell || buy };
}
function emptyReport(): ReportItem { return { count: 0, total: 0, profit: 0 }; }
function safeReport(r: unknown): ReportItem {
  if (!r || typeof r!== "object") return emptyReport();
  const o = r as Partial<ReportItem>;
  return {
    count: typeof o.count === "number"? o.count : 0,
    total: typeof o.total === "number"? o.total : 0,
    profit: typeof o.profit === "number"? o.profit : 0,
  };
}
function useIsOnline() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
  }, []);
  const getSnapshot = useCallback(() => window.navigator.onLine, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function MainDashboard() {
  const isOnline = useIsOnline();
  const isOffline =!isOnline;
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [reports, setReports] = useState<Reports>({ today: emptyReport(), month: emptyReport(), year: emptyReport(), all: emptyReport() });
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchStats = async () => {
      try {
        const cachedProducts = await offlineDB.products.toArray();
        const cachedSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
        setPendingCount(cachedSales.length + cachedProducts.filter(p => p.synced === 0).length);

        const isNowOffline = typeof window!== "undefined" &&!window.navigator.onLine;

        if (isNowOffline) {
          // OFFLINE MODE: use cache only
          setProducts(cachedProducts.map(c => fixProduct({
            _id: c._id || c.localId, name: c.name, price: c.sellPrice || c.price,
            buyPrice: c.buyPrice || 0, sellPrice: c.sellPrice || c.price,
            stock: c.stock, unit: c.unit, localId: c.localId, synced: c.synced,
          })));
          const offSales = cachedSales.slice(0, 5).map(s => ({
            productName: s.productName, quantity: s.quantity, total: s.total,
            profit: s.profit || Math.round(s.total * 0.18), createdAt: s.createdAt, localId: s.localId, synced: 0 as const,
          }));
          setRecentSales(offSales);
          const now = new Date();
          const startToday = new Date(now); startToday.setHours(0,0,0,0);
          const today = cachedSales.filter(s => new Date(s.createdAt) >= startToday);
          setReports({
            today: { count: today.length, total: today.reduce((a,b)=>a+b.total,0), profit: today.reduce((a,b)=>a+(b.profit||0),0) },
            month: { count: cachedSales.length, total: cachedSales.reduce((a,b)=>a+b.total,0), profit: cachedSales.reduce((a,b)=>a+(b.profit||0),0) },
            year: { count: cachedSales.length, total: cachedSales.reduce((a,b)=>a+b.total,0), profit: cachedSales.reduce((a,b)=>a+(b.profit||0),0) },
            all: { count: cachedSales.length, total: cachedSales.reduce((a,b)=>a+b.total,0), profit: cachedSales.reduce((a,b)=>a+(b.profit||0),0) },
          });
          setLoading(false);
          return;
        }

        // ONLINE MODE: use API only - no offline mixing
        const [prodRes, salesRes, reportRes] = await Promise.all([
          fetch("/api/products?limit=100", { signal: controller.signal }),
          fetch("/api/sales?filter=today&limit=5", { signal: controller.signal }),
          fetch("/api/reports", { signal: controller.signal }),
        ]);

        const prodData = (await prodRes.json()) as ProductsResponse;
        const prodList = (Array.isArray(prodData)? prodData : prodData.products || []).map(fixProduct);
        setProducts(prodList);

        let salesData: { sales: Sale[] } = { sales: [] };
        try { salesData = (await salesRes.json()) as { sales: Sale[] }; } catch {}
        setRecentSales((salesData.sales || []).slice(0,5).map(s=> ({...s, profit: s.profit||Math.round(s.total*0.18)})));

        let reportData: Reports | null = null;
        try { reportData = (await reportRes.json()) as Reports; } catch {}
        setReports({
          today: safeReport(reportData?.today),
          month: safeReport(reportData?.month),
          year: safeReport(reportData?.year),
          all: safeReport(reportData?.all),
        });

      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally { setLoading(false); }
    };
    void fetchStats();
    return () => controller.abort();
  }, []);

  const lowStock = products.filter(p => p.stock < 20);
  const stockValue = products.reduce((s,p)=> s + (p.sellPrice||p.price)*p.stock,0);
  const stockProfitPotential = products.reduce((s,p)=>{
    const buy = p.buyPrice && p.buyPrice>0? p.buyPrice : Math.round((p.sellPrice||p.price)*0.82);
    return s + ((p.sellPrice||p.price)-buy)*p.stock;
  },0);

  if (loading) return <p className="p-8 text-center text-gray-400 text-[12px]">Loading Dashboard...</p>;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center">📶 Offline Mode • {pendingCount} pending sync</div>}
      {pendingCount > 0 &&!isOffline && <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl text-center">{pendingCount} offline sales pending sync</div>}

      <h1 className="text-[19px] sm:text-2xl font-bold mb-1">🌾 Dashboard</h1>
      <p className="text-gray-400 mb-4 text-[11px]">{new Date().toLocaleDateString()} • {isOffline? "Offline" : "Online"}</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Today Sale</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.today.total}</p>
          <p className="text-[10px] text-green-600 mt-1">{reports.today.count} sales • Profit Rs.{reports.today.profit}</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">This Month</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.month.total}</p>
          <p className="text-[10px] text-blue-600 mt-1">{reports.month.count} sales • Profit Rs.{reports.month.profit}</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Year Sale</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.year.total}</p>
          <p className="text-[10px] text-green-600 mt-1">{reports.year.count} sales • Profit Rs.{reports.year.profit}</p>
          <p className="text-[9px] text-gray-400 mt-1">All: Rs.{reports.all.total} • Profit Rs.{reports.all.profit}</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Stock Value</p>
          <p className="text-[16px] font-bold mt-1">Rs. {stockValue}</p>
          <p className="text-[10px] text-green-600 mt-1">Potential Profit Rs.{stockProfitPotential}</p>
          <p className="text-[9px] text-gray-400 mt-1">{products.length} products</p>
          <Link href="/dashboard/products" className="text-[10px] text-green-600 mt-2 inline-block">Manage →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-xl border">
          <h2 className="font-bold mb-3 text-[13px]">⚠️ Low Stock {lowStock.length}</h2>
          {lowStock.slice(0,6).map(p=> {
            const buy = p.buyPrice>0? p.buyPrice : Math.round(p.sellPrice*0.82);
            return <div key={p._id} className="flex justify-between py-2 border-b last:border-0 text-[12px]"><span>{p.name}</span><span className="font-bold text-orange-500">{p.stock} • Rs.{p.sellPrice-buy}</span></div>
          })}
        </div>
        <div className="bg-white p-3.5 rounded-xl border">
          <h2 className="font-bold mb-3 text-[13px]">🕒 Today Sales - Profit Rs.{reports.today.profit}</h2>
          {recentSales.length===0? <p className="text-[12px] text-gray-400 py-4 text-center">No sales today</p> : recentSales.map((s,i)=> (
            <div key={`${s.productName}-${i}`} className="flex justify-between py-2 border-b last:border-0 text-[12px]">
              <span>{s.productName} <span className="text-gray-400 text-[10px]">x{s.quantity}</span> {isOffline && s.localId?.startsWith("local_") && <span className="ml-1 text-[8px] bg-amber-200 px-1 rounded-full">OFFLINE</span>}</span>
              <span>Rs.{s.total} <span className="text-[10px] text-green-600">+{s.profit}</span></span>
            </div>
          ))}
          <Link href="/dashboard/sales/history" className="text-[11px] text-green-600 mt-3 inline-block">View all →</Link>
        </div>
      </div>
    </div>
  );
}
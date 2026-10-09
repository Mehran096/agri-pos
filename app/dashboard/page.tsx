"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { offlineDB } from "@/lib/offline-db";

type Product = {
  _id: string;
  name: string;
  price: number;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  unit: string;
  qtyPerUnit?: number;
  subUnit?: string;
  localId?: string;
  synced?: number
};
type Sale = {
  productName: string;
  quantity: number;
  quantityInSub?: number;
  unit?: string;
  subUnit?: string;
  isPartialSale?: boolean;
  total: number;
  profit: number;
  createdAt: string;
  localId?: string;
  synced?: number
};
type ReportItem = { count: number; total: number; profit: number; buy: number };
type Reports = { today: ReportItem; month: ReportItem; year: ReportItem; all: ReportItem };
type ProductsResponse = Product[] | { products: Product[] };

function fixProduct(p: Product): Product {
  const sell = p.sellPrice || p.price || 0;
  const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(sell * 0.82);
  return {
...p,
    buyPrice: buy,
    sellPrice: sell || buy,
    price: sell || buy,
    qtyPerUnit: p.qtyPerUnit || (p.unit === "bag"? 50 : p.unit === "bottle"? 1000 : 1),
    subUnit: p.subUnit || (p.unit === "bag"? "kg" : p.unit === "bottle"? "ml" : ""),
  };
}
function emptyReport(): ReportItem { return { count: 0, total: 0, profit: 0, buy: 0 }; }
function safeReport(r: unknown): ReportItem {
  if (!r || typeof r!== "object") return emptyReport();
  const o = r as Partial<ReportItem>;
  const total = typeof o.total === "number"? o.total : 0;
  const profit = typeof o.profit === "number"? o.profit : 0;
  const buy = typeof o.buy === "number"? o.buy : total - profit;
  return {
    count: typeof o.count === "number"? o.count : 0,
    total,
    profit,
    buy: buy < 0? 0 : buy,
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
          setProducts(cachedProducts.map(c => fixProduct({
            _id: c._id || c.localId, name: c.name, price: c.sellPrice || c.price,
            buyPrice: c.buyPrice || 0, sellPrice: c.sellPrice || c.price,
            stock: c.stock, unit: c.unit, qtyPerUnit: c.qtyPerUnit, subUnit: c.subUnit, localId: c.localId, synced: c.synced,
          })));
          const offSales = cachedSales.slice(0, 5).map(s => ({
            productName: s.productName, quantity: s.quantity, quantityInSub: s.quantityInSub, unit: s.unit, subUnit: s.subUnit, isPartialSale: s.isPartialSale,
            total: s.total, profit: s.profit || 0, createdAt: s.createdAt, localId: s.localId, synced: 0 as const,
          }));
          setRecentSales(offSales);
          const now = new Date();
          const startToday = new Date(now); startToday.setHours(0,0,0,0);
          const today = cachedSales.filter(s => new Date(s.createdAt) >= startToday);
          const toReport = (arr: typeof cachedSales) => {
            const total = arr.reduce((a,b)=>a+b.total,0);
            const profit = arr.reduce((a,b)=>a+(b.profit||0),0);
            return { count: arr.length, total, profit, buy: total - profit };
          };
          setReports({
            today: toReport(today),
            month: toReport(cachedSales),
            year: toReport(cachedSales),
            all: toReport(cachedSales),
          });
          setLoading(false);
          return;
        }

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
        setRecentSales((salesData.sales || []).slice(0,5));

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

  const lowStock = products.filter(p => p.stock < 1);
  const lowStockWarning = products.filter(p => p.stock < 5 && p.stock >= 1);
  const stockValue = products.reduce((s,p)=> s + (p.sellPrice||p.price)*p.stock,0);
  const stockBuyValue = products.reduce((s,p)=> s + (p.buyPrice||0)*p.stock,0);
  const stockProfitPotential = products.reduce((s,p)=>{
    const buy = p.buyPrice && p.buyPrice>0? p.buyPrice : Math.round((p.sellPrice||p.price)*0.82);
    return s + ((p.sellPrice||p.price)-buy)*p.stock;
  },0);

  if (loading) return <p className="p-8 text-center text-gray-400 text-[12px]">Loading Al-Farooq Dashboard...</p>;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center">📶 Offline • {pendingCount} pending • Al-Farooq Shop offline mode</div>}
      {pendingCount > 0 &&!isOffline && <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl text-center">{pendingCount} offline pending • 20kg/40kg/50kg + 500ml/1L/1.5L/2L enabled</div>}

      <div className="flex items-center gap-2.5 mb-1">
        <Image src="/logo.png" alt="logo" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-green-700 shadow-sm" />
        <h1 className="text-[18px] sm:text-2xl font-bold">Al-Farooq Zarghi Shop - الفاروق زرعی سٹور</h1>
      </div>
      <p className="text-[11px] text-green-700 font-bold mb-1">0333-9426374 | 0321-9801598 | 0345-9495414 • Shewa Swabi</p>
      <p className="text-gray-400 mb-4 text-[11px]">{new Date().toLocaleDateString()} • {isOffline? "Offline" : "Online"} • Seeds, Pesticides, Fertilizers • Stock in decimal 9.80 supported</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Today Sale (Sell)</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.today.total.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500 mt-1">Buy Rs.{reports.today.buy.toFixed(0)} • Profit <span className="text-green-700 font-bold">Rs.{reports.today.profit.toFixed(0)}</span></p>
          <p className="text-[10px] text-gray-400 mt-1">{reports.today.count} sales • {reports.today.total>0? ((reports.today.profit/reports.today.total)*100).toFixed(1) : "0"}% margin</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">This Month (Sell)</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.month.total.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500 mt-1">Buy Rs.{reports.month.buy.toFixed(0)} • Profit <span className="text-blue-600 font-bold">Rs.{reports.month.profit.toFixed(0)}</span></p>
          <p className="text-[10px] text-gray-400 mt-1">{reports.month.count} sales</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Year Sale (Sell)</p>
          <p className="text-[16px] font-bold mt-1">Rs. {reports.year.total.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500 mt-1">Buy Rs.{reports.year.buy.toFixed(0)} • Profit <span className="text-green-700 font-bold">Rs.{reports.year.profit.toFixed(0)}</span></p>
          <p className="text-[9px] text-gray-400 mt-1">All Sell: Rs.{reports.all.total.toFixed(0)} • Buy Rs.{reports.all.buy.toFixed(0)}</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border">
          <p className="text-gray-400 text-[10px]">Stock Value (Sell)</p>
          <p className="text-[16px] font-bold mt-1">Rs. {stockValue.toFixed(0)}</p>
          <p className="text-[10px] text-gray-500 mt-1">Buy Rs.{stockBuyValue.toFixed(0)} • Profit <span className="text-green-700 font-bold">Rs.{stockProfitPotential.toFixed(0)}</span></p>
          <p className="text-[9px] text-gray-400 mt-1">{products.length} products • {products.reduce((a,p)=>a+p.stock,0).toFixed(2)} total stock</p>
          <Link href="/dashboard/products" className="text-[10px] text-green-700 mt-2 inline-block">Manage →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-xl border">
          <h2 className="font-bold mb-3 text-[13px]">⚠️ Low Stock &lt;1 {lowStock.length} | Warning &lt;5 {lowStockWarning.length}</h2>
          {[...lowStock,...lowStockWarning].slice(0,6).map(p=> {
            const buy = p.buyPrice>0? p.buyPrice : Math.round(p.sellPrice*0.82);
            const subStock = p.stock * (p.qtyPerUnit||1);
            return <div key={p._id} className="flex justify-between py-2 border-b last:border-0 text-[12px]"><span>{p.name} <span className="text-[10px] text-gray-400">{p.qtyPerUnit}{p.subUnit}/{p.unit}</span></span><span className="font-bold text-orange-500">{p.stock.toFixed(2)} • {subStock.toFixed(1)}{p.subUnit} • Buy {buy} → Sell {p.sellPrice}</span></div>
          })}
          {lowStock.length===0 && lowStockWarning.length===0 && <p className="text-[11px] text-gray-400 py-2">All stocked good 👍</p>}
        </div>
        <div className="bg-white p-3.5 rounded-xl border">
          <h2 className="font-bold mb-3 text-[13px]">🕒 Today Sales - Buy → Sell • Profit Rs.{reports.today.profit.toFixed(0)}</h2>
          {recentSales.length===0? <p className="text-[12px] text-gray-400 py-4 text-center">No sales today - Al-Farooq Shop</p> : recentSales.map((s,i)=> {
            const buy = s.total - s.profit;
            return (
            <div key={`${s.productName}-${i}`} className="flex justify-between py-2 border-b last:border-0 text-[12px]">
              <span className="flex-1 pr-2">{s.productName} <span className="text-gray-400 text-[10px]">{s.isPartialSale? `${s.quantityInSub}${s.subUnit} = ${s.quantity.toFixed(3)} ${s.unit}` : `x${s.quantity.toFixed(2)} ${s.unit||""}`}</span> {isOffline && s.localId?.startsWith("local_") && <span className="ml-1 text-[8px] bg-amber-200 px-1 rounded-full">OFFLINE</span>}</span>
              <span className="text-right shrink-0"><span className="text-[10px] text-gray-400">Buy {buy.toFixed(0)} → </span>Rs.{s.total.toFixed(0)} <span className="text-[10px] text-green-700">+{s.profit.toFixed(0)}</span></span>
            </div>
          )})}
          <Link href="/dashboard/sales/history" className="text-[11px] text-green-700 mt-3 inline-block">View all history →</Link>
        </div>
      </div>
    </div>
  );
}
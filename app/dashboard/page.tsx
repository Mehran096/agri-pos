"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Product = { _id: string; name: string; price: number; stock: number; unit: string };
type Sale = { productName: string; quantity: number; total: number; createdAt: string };
type Reports = { today: { count: number; total: number }; month: { count: number; total: number }; year: { count: number; total: number }; all: { count: number; total: number } };
type ProductsResponse = Product[] | { products: Product[] };

export default function MainDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [reports, setReports] = useState<Reports>({ today: { count: 0, total: 0 }, month: { count: 0, total: 0 }, year: { count: 0, total: 0 }, all: { count: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const fetchStats = async () => {
      try {
        const [prodRes, salesRes, reportRes] = await Promise.all([
          fetch("/api/products?limit=100", { signal: controller.signal }),
          fetch("/api/sales?filter=today&limit=5", { signal: controller.signal }),
          fetch("/api/reports", { signal: controller.signal }),
        ]);
        const prodData = (await prodRes.json()) as ProductsResponse;
        const salesData = (await salesRes.json()) as { sales: Sale[] };
        const reportData = (await reportRes.json()) as Reports;
        const prodList = Array.isArray(prodData)? prodData : prodData.products;
        setProducts(prodList);
        setRecentSales(salesData.sales.slice(0, 5));
        setReports(reportData);
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void fetchStats();
    return () => controller.abort();
  }, []);

  const lowStock = products.filter((p) => p.stock < 20);
  const stockValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);

  if (loading) return <p className="p-8 text-center text-gray-400 text-[12px]">Loading Dashboard...</p>;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      <h1 className="text-[19px] sm:text-2xl font-bold mb-1">🌾 Dashboard</h1>
      <p className="text-gray-400 mb-4 text-[11px] sm:text-[13px]">{new Date().toLocaleDateString()} • Shop overview</p>

      {/* Stats - 2 cols on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-5 sm:mb-8">
        <div className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-[10px] sm:text-[12px]">Today Sale</p>
          <p className="text-[16px] sm:text-2xl font-bold mt-1 leading-tight">Rs. {reports.today.total}</p>
          <p className="text-[10px] sm:text-xs text-green-600 mt-1">{reports.today.count} sales</p>
          <Link href="/dashboard/sales" className="text-[10px] text-gray-400 mt-2 inline-block">View →</Link>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-[10px] sm:text-[12px]">This Month</p>
          <p className="text-[16px] sm:text-2xl font-bold mt-1 leading-tight">Rs. {reports.month.total}</p>
          <p className="text-[10px] sm:text-xs text-blue-600 mt-1">{reports.month.count} sales</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-[10px] sm:text-[12px]">Year / All Time</p>
          <p className="text-[16px] sm:text-2xl font-bold mt-1 leading-tight">Rs. {reports.year.total}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">All: Rs. {reports.all.total}</p>
        </div>
        <div className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-[10px] sm:text-[12px]">Stock Value</p>
          <p className="text-[16px] sm:text-2xl font-bold mt-1 leading-tight">Rs. {stockValue}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{products.length} products</p>
          <Link href="/dashboard/products" className="text-[10px] text-green-600 mt-2 inline-block">Manage →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold mb-3 flex justify-between items-center text-[13px] sm:text-[15px]">⚠️ Low Stock <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full">{lowStock.length}</span></h2>
          {lowStock.length === 0? (
            <p className="text-[12px] text-gray-400 py-4 text-center">All stock is good ✓</p>
          ) : (
            lowStock.slice(0,6).map((p) => (
              <div key={p._id} className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-[12px] sm:text-[13px]">
                <span className="line-clamp-1 pr-2">{p.name}</span>
                <span className={`font-bold shrink-0 ${p.stock === 0? "text-red-600" : "text-orange-500"}`}>{p.stock}</span>
              </div>
            ))
          )}
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold mb-3 text-[13px] sm:text-[15px]">🕒 Today Sales</h2>
          {recentSales.length === 0? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No sales today</p>
          ) : (
            recentSales.map((s, i) => (
              <div key={`${s.productName}-${s.createdAt}-${i}`} className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-[12px] sm:text-[13px]">
                <span className="line-clamp-1 pr-2">{s.productName} <span className="text-gray-400 text-[10px]">x{s.quantity}</span></span>
                <span className="font-medium shrink-0">Rs. {s.total}</span>
              </div>
            ))
          )}
          <Link href="/dashboard/sales/history" className="text-[11px] sm:text-[13px] text-green-600 mt-3 inline-block">View all →</Link>
        </div>
      </div>
    </div>
  );
}
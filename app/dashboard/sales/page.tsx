"use client";
import { useEffect, useState } from "react";

type Product = { _id: string; name: string; price: number; stock: number; unit: string };
type Sale = { _id: string; productId: string; productName: string; quantity: number; price: number; total: number; createdAt: string };
type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type ProductsResponse = Product[] | { products: Product[]; pagination: Pagination };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterType>("today");
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const loadProducts = async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=100`, { signal: controller.signal });
        const data = (await res.json()) as ProductsResponse;
        const list = Array.isArray(data)? data : data.products;
        setProducts(list);
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      }
    };
    void loadProducts();
    return () => controller.abort();
  }, [productSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const salesRes = await fetch(`/api/sales?filter=${filter}&page=${page}&limit=15`, { signal: controller.signal });
        const salesData = (await salesRes.json()) as { sales: Sale[]; total: number; pagination: Pagination };
        if (page === 1) setSales(salesData.sales);
        else setSales((prev) => [...prev,...salesData.sales]);
        setTotal(salesData.total);
        setPagination(salesData.pagination);
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };
    void fetchData();
    return () => controller.abort();
  }, [filter, page]);

  const handleFilterChange = (f: FilterType) => {
    setFilter(f);
    setPage(1);
  };

  const refreshAfterAction = async () => {
    setPage(1);
    const [salesRes, prodRes] = await Promise.all([
      fetch(`/api/sales?filter=${filter}&page=1&limit=15`),
      fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=100`),
    ]);
    const salesData = (await salesRes.json()) as { sales: Sale[]; total: number; pagination: Pagination };
    const prodData = (await prodRes.json()) as ProductsResponse;
    const prodList = Array.isArray(prodData)? prodData : prodData.products;
    setSales(salesData.sales);
    setTotal(salesData.total);
    setPagination(salesData.pagination);
    setProducts(prodList);
  };

  const sell = async (p: Product) => {
    const quantity = qtyMap[p._id] || 1;
    if (p.stock < quantity) {
      window.alert(`Only ${p.stock} left`);
      return;
    }
    await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p._id, productName: p.name, quantity, price: p.price }),
    });
    await refreshAfterAction();
  };

  const handleDeleteSale = async (id: string) => {
    if (!window.confirm("Delete sale and restore stock?")) return;
    await fetch(`/api/sales/${id}`, { method: "DELETE" });
    await refreshAfterAction();
  };

  const handleUpdateQty = async (sale: Sale, newQty: number) => {
    if (newQty < 1) return;
    await fetch(`/api/sales/${sale._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: newQty }),
    });
    await refreshAfterAction();
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {/* Top Bar - compact */}
      <div className="flex flex-col gap-2.5 mb-4 sm:mb-6">
        <h1 className="text-[19px] sm:text-2xl font-bold">💰 Sales Point</h1>
        <div className="bg-green-600 text-white px-3.5 py-2 rounded-xl font-bold text-[13px] sm:text-[15px] w-fit">
          {filter.toUpperCase()}: Rs. {total} • {pagination.totalCount}
        </div>
      </div>

      {/* Products Search - small */}
      <div className="flex flex-col gap-2 mb-3">
        <h2 className="font-semibold text-gray-700 text-[13px] sm:text-[15px]">Quick Sell</h2>
        <input
          placeholder="🔍 Search products..."
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          className="border border-gray-200 p-2.5 rounded-xl w-full outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm text-[13px] sm:text-sm"
        />
      </div>

      {products.length === 0? (
        <p className="text-center text-gray-400 py-8 bg-white rounded-xl border mb-5 text-[12px]">No products for &quot;{productSearch}&quot;</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-6">
          {products.map((p) => (
            <div key={p._id} className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col">
              <div className="flex justify-between items-start gap-2">
                <p className="font-semibold text-[13px] sm:text-[14px] line-clamp-1">{p.name}</p>
                <span className={`text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full h-fit shrink-0 ${p.stock < 20? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>{p.stock} left</span>
              </div>
              <p className="text-[11px] sm:text-[13px] text-gray-500 mt-1">Rs. {p.price}/{p.unit}</p>
              <div className="flex gap-2 mt-2.5">
                <input type="number" min={1} max={p.stock} value={qtyMap[p._id] || 1} onChange={(e) => setQtyMap({...qtyMap, [p._id]: Number(e.target.value) })} className="border border-gray-200 rounded-lg w-14 sm:w-20 p-1.5 sm:p-2 text-center text-[12px] sm:text-[14px]" />
                <button onClick={() => sell(p)} disabled={p.stock === 0} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium text-[12px] sm:text-[14px] py-1.5 sm:py-2">Sell</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters - smaller pills */}
      <div className="flex flex-col gap-2 mb-3">
        <h2 className="font-bold text-[14px] sm:text-[16px] capitalize">{filter} Records</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => handleFilterChange(f)} className={`px-3 py-1.5 rounded-full text-[11px] sm:text-[13px] capitalize whitespace-nowrap transition ${filter === f? "bg-green-600 text-white shadow" : "bg-white border border-gray-200"}`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {sales.length === 0 &&!loading? (
          <p className="p-6 text-center text-gray-400 text-[12px]">No sales for {filter}</p>
        ) : (
          <>
            {sales.map((s) => (
              <div key={s._id} className="p-3 sm:p-4 border-b border-gray-50 last:border-0 flex flex-col gap-1.5 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <p className="font-medium text-[12px] sm:text-[14px]">{s.productName} <span className="text-gray-400 text-[11px]">x{s.quantity}</span></p>
                  <span className="font-bold text-[12px] sm:text-[14px]">Rs. {s.total}</span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-gray-400">{new Date(s.createdAt).toLocaleDateString()} • {new Date(s.createdAt).toLocaleTimeString()}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <button onClick={() => handleUpdateQty(s, s.quantity - 1)} className="px-2.5 py-1 bg-gray-100 rounded-lg text-[11px]">-</button>
                  <button onClick={() => handleUpdateQty(s, s.quantity + 1)} className="px-2.5 py-1 bg-gray-100 rounded-lg text-[11px]">+</button>
                  <button onClick={() => handleDeleteSale(s._id)} className="ml-auto text-red-500 text-[11px] bg-red-50 px-2.5 py-1 rounded-lg">Delete</button>
                </div>
              </div>
            ))}
            {pagination.hasMore && (
              <div className="p-2.5 bg-gray-50">
                <button onClick={() => setPage((p) => p + 1)} disabled={loadingMore} className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[12px] sm:text-[13px] font-medium disabled:opacity-50">
                  {loadingMore? "Loading..." : `Load More (${pagination.totalCount - sales.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
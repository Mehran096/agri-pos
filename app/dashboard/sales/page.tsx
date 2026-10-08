"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { offlineDB, OfflineProduct, OfflineSale } from "@/lib/offline-db";
import { getOfflineUser } from "@/lib/offline-auth";

type Product = { _id: string; name: string; price: number; buyPrice: number; sellPrice: number; stock: number; unit: string };
type Sale = { _id: string; productId: string; productName: string; quantity: number; price: number; buyPrice: number; sellPrice: number; profit: number; total: number; createdAt: string; localId?: string; synced?: number };
type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type ProductsResponse = Product[] | { products: Product[]; pagination: Pagination };
type ErrorResponse = { error: string };
type SalesApiResponse = { sales: Sale[]; total: number; profit: number; pagination: Pagination };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];
const PRODUCTS_PER_PAGE = 12;

function fixProduct(p: Product): Product {
  const sell = p.sellPrice?? p.price?? 0;
  const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(sell * 0.82);
  return {...p, buyPrice: buy, sellPrice: sell || buy, price: sell || buy };
}
function useIsOnline() {
  const subscribe = useCallback((cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; }, []);
  const getSnapshot = useCallback(() => navigator.onLine, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
function generateLocalId() {
  if (typeof crypto!== "undefined" && "randomUUID" in crypto) return `local_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
// dedupe helper
function dedupeProducts(arr: Product[]): Product[] {
  const m = new Map<string, Product>();
  for (const p of arr) m.set(p._id, p);
  return Array.from(m.values());
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [profit, setProfit] = useState(0);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterType>("today");
  const [page, setPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [productPagination, setProductPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [mounted, setMounted] = useState(false);
  const isOnline = useIsOnline();
  const isOffline = mounted &&!isOnline;
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true); 
  }, []);
  const getEditedPrice = useCallback((p: Product) => {
    const raw = priceMap[p._id];
    if (raw===undefined || raw==="") return p.sellPrice?? p.price?? 0;
    const n = Number(raw);
    return Number.isNaN(n)? (p.sellPrice?? p.price?? 0) : n;
  }, [priceMap]);

  const refreshSalesOnly = useCallback(async () => {
    setPage(1);
    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
      const mapped: Sale[] = offlineSales.map((o) => {
        const sell = o.sellPrice?? o.price?? 0; const buy = o.buyPrice?? Math.round(sell * 0.82); const qty = o.quantity?? 1;
        return { _id: o.localId, productId: o.productId, productName: o.productName, quantity: qty, price: sell, buyPrice: buy, sellPrice: sell, profit: o.profit?? (sell - buy) * qty, total: o.total?? sell * qty, createdAt: o.createdAt, localId: o.localId, synced: 0 };
      });
      setSales(mapped); setTotal(mapped.reduce((a, b) => a + b.total, 0)); setProfit(mapped.reduce((a, b) => a + b.profit, 0)); return;
    }
    const salesRes = await fetch(`/api/sales?filter=${filter}&page=1&limit=15`);
    const salesData = (await salesRes.json()) as SalesApiResponse;
    const fixedSales = salesData.sales.map((s) => {
      const sell = s.sellPrice?? s.price?? 0; const buy = s.buyPrice && s.buyPrice > 0? s.buyPrice : Math.round(sell * 0.82);
      return {...s, buyPrice: buy, sellPrice: sell, profit: s.profit && s.profit > 0? s.profit : (sell - buy) * s.quantity };
    });
    setSales(fixedSales); setTotal(salesData.total); setProfit(salesData.profit && salesData.profit > 0? salesData.profit : fixedSales.reduce((a, b) => a + b.profit, 0)); setPagination(salesData.pagination);
  }, [filter]);

  const syncPendingSales = useCallback(async () => {
    if (typeof window === "undefined" ||!window.navigator.onLine) return;
    const pending = await offlineDB.sales.where("synced").equals(0).toArray(); if (pending.length === 0) return;
    setSyncing(true); let synced = 0;
    for (const s of pending) {
      try {
        const sell = s.sellPrice?? s.price?? 0;
        const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: s.productId, productName: s.productName, quantity: s.quantity, price: sell, buyPrice: s.buyPrice, sellPrice: sell, profit: s.profit, total: s.total, localId: s.localId, customerName: s.customerName, paymentType: s.paymentType, offlineCreatedAt: s.createdAt, soldBy: s.soldBy }) });
        if (res.ok) { await offlineDB.sales.update(s.localId, { synced: 1 }); synced++; }
      } catch {}
    }
    setPendingCount((prev) => Math.max(0, prev - synced)); setSyncing(false); if (synced > 0) void refreshSalesOnly();
  }, [refreshSalesOnly]);

  useEffect(() => {
    if (!mounted) return;
    const init = async () => { const count = await offlineDB.sales.where("synced").equals(0).count(); setPendingCount(count); };
    void init();
    const handleOnline = () => { void syncPendingSales(); };
    window.addEventListener("online", handleOnline); return () => window.removeEventListener("online", handleOnline);
  }, [mounted, syncPendingSales]);

  // FIXED: OFFLINE + ONLINE with dedupe and load more
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadProducts = async () => {
      try {
        const cached = await offlineDB.products.toArray();
        const isOfflineNow = typeof window!== "undefined" &&!window.navigator.onLine;

        if (cached.length > 0 &&!cancelled) {
          const mapped = dedupeProducts(
            cached
            .map((c: OfflineProduct) =>
                fixProduct({
                  _id: c._id || c.localId,
                  name: c.name,
                  price: c.sellPrice?? c.price?? 0,
                  buyPrice: c.buyPrice?? 0,
                  sellPrice: c.sellPrice?? c.price?? 0,
                  stock: c.stock,
                  unit: c.unit,
                } as Product)
              )
            .filter((p) =>!productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
          );

          const totalCached = mapped.length;
          const paged = mapped.slice(0, productPage * PRODUCTS_PER_PAGE);

          setProducts(paged);
          setProductPagination({
            page: productPage,
            totalPages: Math.ceil(totalCached / PRODUCTS_PER_PAGE),
            hasMore: paged.length < totalCached,
            totalCount: totalCached,
          });

          if (isOfflineNow) {
            setLoadingMoreProducts(false);
            return;
          }
        } else if (isOfflineNow) {
          setProducts([]);
          setProductPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
          setLoadingMoreProducts(false);
          return;
        }

        setLoadingMoreProducts(true);
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(productSearch)}&page=${productPage}&limit=${PRODUCTS_PER_PAGE}`,
          { signal: controller.signal }
        );
        const data = (await res.json()) as ProductsResponse;
        let list: Product[] = Array.isArray(data)? data : data.products;
        list = dedupeProducts(list.map(fixProduct));
        if (cancelled) return;

        if (productSearch) {
          setProducts(list);
        } else {
          if (productPage === 1) setProducts(list);
          else setProducts((prev) => dedupeProducts([...prev,...list]));
        }
        if (!Array.isArray(data)) setProductPagination(data.pagination);

        if (productPage === 1 &&!productSearch) {
          try {
            const allRes = await fetch(`/api/products?limit=200`, { signal: controller.signal });
            const allData = (await allRes.json()) as ProductsResponse;
            const allList = Array.isArray(allData)? allData : allData.products;
            if (!cancelled && allList.length > 0) {
              const unsynced = cached.filter((c) => c.synced === 0);
              await offlineDB.products.clear();
              await offlineDB.products.bulkAdd([
              ...unsynced,
              ...dedupeProducts(allList.map((p) => fixProduct(p as Product))).map((p) => {
                  return { _id: p._id, localId: p._id, name: p.name, price: p.sellPrice, buyPrice: p.buyPrice, sellPrice: p.sellPrice, stock: p.stock, unit: p.unit, userId: "cached", synced: 1 as const };
                }),
              ]);
            }
          } catch {}
        }
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        if (!cancelled) setLoadingMoreProducts(false);
      }
    };

    void loadProducts();
    return () => { cancelled = true; controller.abort(); };
  }, [productSearch, productPage]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      if (page === 1) setLoading(true); else setLoadingMore(true);
      try {
        const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
        const offlineMapped: Sale[] = offlineSales.map((o) => {
          const sell = o.sellPrice?? o.price?? 0; const buy = o.buyPrice?? Math.round(sell * 0.82); const qty = o.quantity?? 1;
          return { _id: o.localId, productId: o.productId, productName: o.productName, quantity: qty, price: sell, buyPrice: buy, sellPrice: sell, profit: o.profit?? (sell - buy) * qty, total: o.total?? sell * qty, createdAt: o.createdAt, localId: o.localId, synced: 0 };
        });
        if (typeof window!== "undefined" &&!window.navigator.onLine) {
          setSales(offlineMapped); setTotal(offlineMapped.reduce((a, b) => a + b.total, 0)); setProfit(offlineMapped.reduce((a, b) => a + b.profit, 0));
          setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: offlineMapped.length }); return;
        }
        const salesRes = await fetch(`/api/sales?filter=${filter}&page=${page}&limit=15`, { signal: controller.signal });
        const salesData = (await salesRes.json()) as SalesApiResponse;
        const fixed = salesData.sales.map((s) => {
          const sell = s.sellPrice?? s.price?? 0; const buy = s.buyPrice && s.buyPrice > 0? s.buyPrice : Math.round(sell * 0.82);
          return {...s, buyPrice: buy, sellPrice: sell, profit: s.profit && s.profit > 0? s.profit : (sell - buy) * s.quantity };
        });
        if (page === 1) setSales([...offlineMapped,...fixed]); else setSales((prev) => [...prev,...fixed]);
        setTotal(salesData.total + offlineMapped.reduce((a, b) => a + b.total, 0));
        const onlineProfit = salesData.profit && salesData.profit > 0? salesData.profit : fixed.reduce((a, b) => a + b.profit, 0);
        setProfit(onlineProfit + offlineMapped.reduce((a, b) => a + b.profit, 0)); setPagination(salesData.pagination);
      } catch (err) { if ((err as Error).name!== "AbortError") console.error(err); } finally { setLoading(false); setLoadingMore(false); }
    }; void fetchData(); return () => controller.abort();
  }, [filter, page]);

  const sell = async (p: Product) => {
    const quantity = qtyMap[p._id] || 1; const editedSellPrice = getEditedPrice(p); const currentStock = p.stock?? 0;
    if (currentStock <= 0) { window.alert(`${p.name} is out of stock!`); return; }
    if (quantity > currentStock) { window.alert(`Only ${currentStock} left for ${p.name}`); return; }
    const offlineUser = getOfflineUser(); const localId = generateLocalId(); const now = new Date().toISOString();
    const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(editedSellPrice * 0.82); const profitVal = (editedSellPrice - buy) * quantity;
    setProducts((prev) => prev.map((prod) => (prod._id === p._id? {...prod, stock: prod.stock - quantity } : prod)));
    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const offlineSale: OfflineSale = { localId, productId: p._id, productName: p.name, quantity, price: editedSellPrice, buyPrice: buy, sellPrice: editedSellPrice, profit: profitVal, total: quantity * editedSellPrice, soldBy: offlineUser?.name || "shop", customerName: "Walk-in", paymentType: "cash", createdAt: now, offlineCreatedAt: now, synced: 0, userId: offlineUser?._id || "offline" };
      await offlineDB.sales.put(offlineSale); await offlineDB.products.where("_id").equals(p._id).or("localId").equals(p._id).modify((prod) => { prod.stock -= quantity; }); setPendingCount((c) => c + 1); await refreshSalesOnly(); return;
    }
    try {
      const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p._id, productName: p.name, quantity, price: editedSellPrice, buyPrice: buy, sellPrice: editedSellPrice, originalPrice: p.sellPrice, profit: profitVal, total: quantity * editedSellPrice, localId }) });
      if (!res.ok) { const err = (await res.json()) as ErrorResponse; window.alert(err.error || "Sale failed"); setProducts((prev) => prev.map((prod) => (prod._id === p._id? {...prod, stock: prod.stock + quantity } : prod))); return; }
      await offlineDB.products.where("_id").equals(p._id).or("localId").equals(p._id).modify((prod) => { prod.stock -= quantity; });
    } catch {
      const offlineSale: OfflineSale = { localId, productId: p._id, productName: p.name, quantity, price: editedSellPrice, buyPrice: buy, sellPrice: editedSellPrice, profit: profitVal, total: quantity * editedSellPrice, soldBy: offlineUser?.name || "shop", customerName: "Walk-in", paymentType: "cash", createdAt: now, offlineCreatedAt: now, synced: 0, userId: offlineUser?._id || "offline" };
      await offlineDB.sales.put(offlineSale); setPendingCount((c) => c + 1);
    } await refreshSalesOnly();
  };

  const handleDeleteSale = async (id: string) => {
    if (!window.confirm("Delete sale and restore stock?")) return;
    setDeletingId(id);
    try {
      const saleToDelete = sales.find((s) => s._id === id); const qtyToRestore = saleToDelete?.quantity?? 0; const productId = saleToDelete?.productId;
      if (id.startsWith("local_")) {
        await offlineDB.sales.delete(id);
        if (productId) { await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify((p) => { p.stock += qtyToRestore; }); setProducts((prev) => prev.map((p) => (p._id === productId? {...p, stock: p.stock + qtyToRestore } : p))); }
        setPendingCount((c) => Math.max(0, c - 1));
      } else {
        const res = await fetch(`/api/sales/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Delete failed");
        if (productId) { await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify((p) => { p.stock += qtyToRestore; }); setProducts((prev) => prev.map((p) => (p._id === productId? {...p, stock: p.stock + qtyToRestore } : p))); }
      }
      await refreshSalesOnly();
    } catch (e) { window.alert((e as Error).message || "Delete failed"); } finally { setDeletingId(null); }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
      {mounted && isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center font-medium">📶 Offline Mode • {pendingCount} pending • {productPagination.totalCount} products</div>}
      {mounted && pendingCount > 0 &&!isOffline && (
        <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl text-center font-medium flex flex-wrap gap-2 justify-between items-center">
          <span>{pendingCount} offline sales pending</span>
          <button onClick={() => syncPendingSales()} disabled={syncing} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[11px] disabled:opacity-50">{syncing? "Syncing..." : "Sync Now"}</button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-[18px] sm:text-xl lg:text-2xl font-bold">💰 Sales Point</h1>
        <div className="flex gap-2 flex-wrap">
          <div className="bg-green-600 text-white px-3.5 py-2 rounded-xl font-bold text-[12px] sm:text-[13px]">{filter.toUpperCase()}: Rs. {total}</div>
          <div className="bg-blue-600 text-white px-3.5 py-2 rounded-xl font-bold text-[12px] sm:text-[13px]">Profit: Rs. {profit}</div>
          <div className="bg-white border px-3 py-2 rounded-xl text-[11px]">{pagination.totalCount + pendingCount} sales</div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3 sm:items-center">
        <h2 className="font-semibold text-[13px] flex-1">Quick Sell - Edit Price</h2>
        <input placeholder="🔍 Search products..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} className="border p-2.5 rounded-xl w-full sm:w-64 bg-white text-[13px] outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      {products.length === 0? <p className="text-center text-gray-400 py-8 bg-white rounded-xl border mb-5 text-[12px]">{loadingMoreProducts? "Loading..." : "No products cached. Go online once."}</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 mb-3">
            {products.map((p) => {
              const stock = p.stock?? 0; const qty = qtyMap[p._id] || 1; const editedPrice = getEditedPrice(p);
              const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(editedPrice * 0.82); const profitPerUnit = editedPrice - buy; const outOfStock = stock <= 0; const notEnough = qty > stock;
              return (
                <div key={p._id} className="bg-white border rounded-xl p-3 shadow-sm flex flex-col h-full">
                  <div className="flex justify-between gap-2"><p className="font-semibold text-[13px] line-clamp-1 flex-1">{p.name}</p><span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 h-fit ${outOfStock? "bg-red-100 text-red-600" : stock < 20? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}>{outOfStock? "0 left" : `${stock} ${p.unit}`}</span></div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                    <div className="bg-red-50 p-1.5 rounded text-center">Buy<br /><b className="text-red-600">Rs.{buy}</b></div>
                    <div className="bg-blue-50 p-1.5 rounded text-center">Sell<br /><b className="text-blue-600">Rs.{p.sellPrice || p.price}</b></div>
                    <div className={`p-1.5 rounded text-center ${profitPerUnit >= 0? "bg-green-50" : "bg-red-50"}`}>Profit<br /><b className={profitPerUnit >= 0? "text-green-600" : "text-red-600"}>Rs.{profitPerUnit}</b></div>
                  </div>
                  <div className="flex gap-1.5 mt-2.5 items-center">
                    <div className="flex items-center border rounded-lg bg-white overflow-hidden shrink-0">
                      <button type="button" onClick={() => setQtyMap({...qtyMap, [p._id]: Math.max(1, (qtyMap[p._id] || 1) - 1) })} disabled={outOfStock} className="px-2.5 sm:px-3 py-2 text-[14px] font-bold bg-gray-50 disabled:opacity-40">-</button>
                      <input type="tel" inputMode="numeric" value={qty} disabled={outOfStock} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); const num = v === ""? 1 : Math.max(1, Math.min(stock, Number(v))); setQtyMap({...qtyMap, [p._id]: num }); }} className="w-9 sm:w-11 text-center p-2 text-[12px] border-x outline-none bg-white" />
                      <button type="button" onClick={() => setQtyMap({...qtyMap, [p._id]: Math.min(stock || 1, (qtyMap[p._id] || 1) + 1) })} disabled={outOfStock} className="px-2.5 sm:px-3 py-2 text-[14px] font-bold bg-gray-50 disabled:opacity-40">+</button>
                    </div>
                    <input type="text" inputMode="numeric" value={priceMap[p._id]?? String(p.sellPrice?? p.price)} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setPriceMap({...priceMap, [p._id]: v }); }} onFocus={(e) => e.target.select()} className="w-16 sm:w-20 border border-amber-300 bg-amber-50 rounded-lg p-2 text-[12px] font-bold text-center outline-none focus:ring-2 focus:ring-amber-400" />
                    <button onClick={() => sell(p)} disabled={outOfStock || notEnough} className={`flex-1 rounded-lg font-medium text-[11px] sm:text-[12px] py-2.5 ${outOfStock || notEnough? "bg-gray-200 text-gray-500" : "bg-green-600 hover:bg-green-700 text-white"}`}>{outOfStock? "Out" : "Sell"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          {productPagination.hasMore && <button onClick={() => setProductPage((pr) => pr + 1)} disabled={loadingMoreProducts} className="w-full mb-6 py-2.5 bg-white border border-green-600 text-green-700 rounded-xl text-[12px] font-medium hover:bg-green-50 disabled:opacity-50">{loadingMoreProducts? "Loading..." : `Load More Products (${productPagination.totalCount - products.length} more) ↓`}</button>}
          <p className="text-center text-[10px] text-gray-400 mb-6">{products.length} / {productPagination.totalCount} products {isOffline && "(offline)"}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2 mb-3 items-center"><h2 className="font-bold text-[14px] capitalize flex-1">{filter} Records - Profit Rs.{profit}</h2><div className="flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map((f) => (<button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`px-3 py-1.5 rounded-full text-[11px] capitalize whitespace-nowrap ${filter === f? "bg-green-600 text-white" : "bg-white border"}`}>{f}</button>))}</div></div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {sales.length === 0 &&!loading? <p className="p-6 text-center text-gray-400 text-[12px]">No sales for {filter}</p> : (
          <>
            {sales.map((s) => {
              const prod = products.find((p) => p._id === s.productId);
              const isDeleting = deletingId === s._id;
              return (
                <div key={s._id} className={`p-3 border-b last:border-0 flex flex-col gap-1.5 transition ${s._id.startsWith("local_")? "bg-amber-50/50" : ""} ${isDeleting? "opacity-60 bg-red-50" : ""}`}>
                  <div className="flex justify-between gap-2">
                    <p className="font-medium text-[12px] truncate pr-2">{s.productName} <span className="text-gray-400">x{s.quantity}</span> <span className="text-[11px] text-gray-500">@Rs.{s.sellPrice}</span> {s._id.startsWith("local_") && <span className="ml-1 text-[9px] bg-amber-200 px-1.5 py-0.5 rounded-full">OFFLINE</span>}</p>
                    <span className="font-bold text-[12px] shrink-0">Rs.{s.total} <span className="text-[10px] text-green-600 font-normal">+{s.profit}</span></span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-gray-400" suppressHydrationWarning>{mounted? `${new Date(s.createdAt).toLocaleTimeString()} • Buy Rs.${s.buyPrice}` : ""} <span className="ml-1 text-gray-500">• {prod? `${prod.stock} left` : ""}</span></p>
                    <button onClick={() => handleDeleteSale(s._id)} disabled={isDeleting} className={`text-[11px] px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 ${isDeleting? "bg-gray-200 text-gray-500" : "text-red-600 bg-red-50 hover:bg-red-100"}`}>{isDeleting? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block"></span> Deleting...</> : "Delete"}</button>
                  </div>
                </div>
              );
            })}
            {pagination.hasMore && <div className="p-2.5 bg-gray-50"><button onClick={() => setPage((p) => p + 1)} disabled={loadingMore} className="w-full py-2.5 bg-white border rounded-xl text-[12px] font-medium disabled:opacity-50">{loadingMore? "Loading..." : `Load More Sales (${pagination.totalCount - sales.length})`}</button></div>}
          </>
        )}
      </div>
    </div>
  );
}
"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { offlineDB, OfflineProduct, OfflineSale } from "@/lib/offline-db";
import { getOfflineUser } from "@/lib/offline-auth";

type Product = {
  _id: string; name: string; price: number; buyPrice: number; sellPrice: number;
  stock: number; unit: string; qtyPerUnit?: number; subUnit?: string;
};
type Sale = {
  _id: string; productId: string; productName: string; quantity: number; quantityInSub?: number;
  unit?: string; subUnit?: string; isPartialSale?: boolean; price: number; buyPrice: number;
  sellPrice: number; profit: number; total: number; createdAt: string; localId?: string;
  qtyPerUnit?: number;
};
type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type ProductsResponse = Product[] | { products: Product[]; pagination: Pagination };
type SalesApiResponse = { sales: Sale[]; total: number; profit: number; pagination: Pagination };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];
const PRODUCTS_PER_PAGE = 12;

function fixProduct(p: Product): Product {
  const sell = p.sellPrice?? p.price?? 0;
  const buy = p.buyPrice && p.buyPrice > 0? p.buyPrice : Math.round(sell * 0.82);
  return {...p, buyPrice: buy, sellPrice: sell || buy, price: sell || buy,
    qtyPerUnit: p.qtyPerUnit || (p.unit === "bag"? 50 : p.unit === "bottle"? 1000 : 1),
    subUnit: p.subUnit || (p.unit === "bag"? "kg" : p.unit === "bottle"? "ml" : p.unit),
  };
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
function dedupeProducts(arr: Product[]): Product[] {
  const m = new Map<string, Product>(); for (const p of arr) m.set(p._id, p); return Array.from(m.values());
}
function toOfflineProduct(p: Product): OfflineProduct {
  return {
    _id: p._id,
    localId: p._id,
    name: p.name,
    price: p.sellPrice,
    sellPrice: p.sellPrice,
    buyPrice: p.buyPrice,
    stock: p.stock,
    unit: p.unit,
    qtyPerUnit: p.qtyPerUnit,
    subUnit: p.subUnit,
  } as OfflineProduct;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0); const [profit, setProfit] = useState(0);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [subQtyMap, setSubQtyMap] = useState<Record<string, number>>({});
  const [modeMap, setModeMap] = useState<Record<string, "main" | "sub">>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterType>("today"); const [page, setPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [productPagination, setProductPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [mounted, setMounted] = useState(false); const isOnline = useIsOnline();
  const isOffline = mounted &&!isOnline; const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false); const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);
  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true); 
  }, []);

  const getSellCalc = useCallback((p: Product) => {
    const mode = modeMap[p._id] || "main";
    const qtyPerUnit = p.qtyPerUnit || (p.unit === "bag"? 50 : p.unit === "bottle"? 1000 : 1);
    const mainQty = qtyMap[p._id] || 1;
    const subQty = subQtyMap[p._id] || 0;
    const raw = priceMap[p._id];
    const hasEdit = raw!== undefined && raw!== "";
    const edited = hasEdit? Number(raw) : 0;
    if (mode === "sub") {
      let pricePerSub: number; let isTotalInput = false;
      if (hasEdit) {
        const isMl = p.subUnit === "ml" || qtyPerUnit >= 100;
        const threshold = isMl? 30 : 500;
        if (subQty > 0 && edited >= threshold) { pricePerSub = edited / subQty; isTotalInput = true; }
        else { pricePerSub = edited; }
      } else { pricePerSub = p.sellPrice / qtyPerUnit; }
      const buyPerSub = p.buyPrice / qtyPerUnit;
      return { mode, qtyMain: subQty / qtyPerUnit, qtySub: subQty, total: subQty * pricePerSub, pricePerSub, sellPricePerMain: pricePerSub * qtyPerUnit, buyPerSub, buyPerMain: p.buyPrice, profit: (pricePerSub - buyPerSub) * subQty, isTotalInput };
    } else {
      const sellPricePerMain = hasEdit? edited : p.sellPrice;
      return { mode, qtyMain: mainQty, qtySub: mainQty * qtyPerUnit, total: mainQty * sellPricePerMain, pricePerSub: sellPricePerMain / qtyPerUnit, sellPricePerMain, buyPerSub: p.buyPrice / qtyPerUnit, buyPerMain: p.buyPrice, profit: (sellPricePerMain - p.buyPrice) * mainQty, isTotalInput: false };
    }
  }, [modeMap, qtyMap, subQtyMap, priceMap]);

  const refreshSalesOnly = useCallback(async () => {
    setPage(1);
    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
      const mapped: Sale[] = offlineSales.map((o) => ({ _id: o.localId, productId: o.productId, productName: o.productName, quantity: o.quantity?? 1, quantityInSub: o.quantityInSub, unit: o.unit, subUnit: o.subUnit, isPartialSale: o.isPartialSale, price: o.sellPrice?? 0, buyPrice: o.buyPrice?? 0, sellPrice: o.sellPrice?? 0, profit: o.profit?? 0, total: o.total?? 0, createdAt: o.createdAt, localId: o.localId, qtyPerUnit: o.qtyPerUnit }));
      setSales(mapped); setTotal(mapped.reduce((a, b) => a + b.total, 0)); setProfit(mapped.reduce((a, b) => a + b.profit, 0)); return;
    }
    try {
      const salesRes = await fetch(`/api/sales?filter=${filter}&page=1&limit=15`);
      const salesData = (await salesRes.json()) as SalesApiResponse;
      setSales(salesData.sales); setTotal(salesData.total); setProfit(salesData.profit); setPagination(salesData.pagination);
    } catch {}
  }, [filter]);

  const syncPendingSales = useCallback(async () => {
    if (typeof window === "undefined" ||!window.navigator.onLine) return;
    const pending = await offlineDB.sales.where("synced").equals(0).toArray(); if (pending.length === 0) return;
    setSyncing(true); let synced = 0;
    for (const s of pending) {
      try {
        const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: s.productId, productName: s.productName, quantity: s.quantity, quantityInSub: s.quantityInSub, unit: s.unit, subUnit: s.subUnit, qtyPerUnit: s.qtyPerUnit, isPartialSale: s.isPartialSale, pricePerSub: s.pricePerSub, price: s.sellPrice, buyPrice: s.buyPrice, sellPrice: s.sellPrice, profit: s.profit, total: s.total, localId: s.localId, customerName: s.customerName, paymentType: s.paymentType, offlineCreatedAt: s.createdAt, soldBy: s.soldBy }) });
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

  useEffect(() => {
    let cancelled = false; const controller = new AbortController();
    const loadProducts = async () => {
      try {
        const cached = await offlineDB.products.toArray();
        const isOfflineNow = typeof window!== "undefined" &&!window.navigator.onLine;
        const searchLower = productSearch.toLowerCase();
        if (cached.length > 0 &&!cancelled) {
          const filteredCache = cached
         .map((c: OfflineProduct) => fixProduct({ _id: c._id || c.localId, name: c.name, price: c.sellPrice?? c.price?? 0, buyPrice: c.buyPrice?? 0, sellPrice: c.sellPrice?? c.price?? 0, stock: c.stock, unit: c.unit, qtyPerUnit: c.qtyPerUnit, subUnit: c.subUnit } as Product))
         .filter((p) =>!searchLower || p.name.toLowerCase().includes(searchLower));
          const dedupedCache = dedupeProducts(filteredCache);
          const pagedCache = dedupedCache.slice(0, productPage * PRODUCTS_PER_PAGE);
          setProducts(pagedCache);
          setProductPagination({ page: productPage, totalPages: Math.ceil(dedupedCache.length / PRODUCTS_PER_PAGE), hasMore: pagedCache.length < dedupedCache.length, totalCount: dedupedCache.length });
          if (isOfflineNow) { setLoadingMoreProducts(false); return; }
        } else if (isOfflineNow) {
          setProducts([]); setProductPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 }); setLoadingMoreProducts(false); return;
        }
        setLoadingMoreProducts(true);
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&page=${productPage}&limit=${PRODUCTS_PER_PAGE}`, { signal: controller.signal });
        const data = (await res.json()) as ProductsResponse; let list: Product[] = Array.isArray(data)? data : data.products;
        list = dedupeProducts(list.map(fixProduct)); if (cancelled) return;
        try { if (list.length > 0) { await offlineDB.products.bulkPut(list.map(toOfflineProduct)); } } catch {}
        if (productSearch) {
          setProducts(list);
          setProductPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: list.length });
        } else {
          if (productPage === 1) setProducts(list); else setProducts((prev) => dedupeProducts([...prev,...list]));
          if (!Array.isArray(data) && data.pagination) {
            setProductPagination(data.pagination);
          } else {
            const hasMore = list.length >= PRODUCTS_PER_PAGE;
            setProductPagination({ page: productPage, totalPages: hasMore? productPage + 1 : productPage, hasMore, totalCount: hasMore? 999 : list.length });
          }
        }
        if (productPage === 1 &&!productSearch && typeof window!== "undefined" && window.navigator.onLine) {
          void (async () => {
            try {
              const allRes = await fetch(`/api/products?limit=200`);
              const allData = (await allRes.json()) as ProductsResponse;
              const allList: Product[] = Array.isArray(allData)? allData : allData.products;
              const fixedAll = dedupeProducts(allList.map(fixProduct));
              if (fixedAll.length > 0) { await offlineDB.products.bulkPut(fixedAll.map(toOfflineProduct)); }
            } catch {}
          })();
        }
      } catch (err) { if ((err as Error).name!== "AbortError") console.error(err); } finally { if (!cancelled) setLoadingMoreProducts(false); }
    }; void loadProducts(); return () => { cancelled = true; controller.abort(); };
  }, [productSearch, productPage]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      if (page === 1) setLoading(true); else setLoadingMore(true);
      try {
        const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
        const offlineMapped: Sale[] = offlineSales.map((o) => ({ _id: o.localId, productId: o.productId, productName: o.productName, quantity: o.quantity?? 1, quantityInSub: o.quantityInSub, unit: o.unit, subUnit: o.subUnit, isPartialSale: o.isPartialSale, price: o.sellPrice?? 0, buyPrice: o.buyPrice?? 0, sellPrice: o.sellPrice?? 0, profit: o.profit?? 0, total: o.total?? 0, createdAt: o.createdAt, localId: o.localId, qtyPerUnit: o.qtyPerUnit }));
        if (typeof window!== "undefined" &&!window.navigator.onLine) {
          setSales(offlineMapped); setTotal(offlineMapped.reduce((a, b) => a + b.total, 0)); setProfit(offlineMapped.reduce((a, b) => a + b.profit, 0));
          setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: offlineMapped.length }); return;
        }
        const salesRes = await fetch(`/api/sales?filter=${filter}&page=${page}&limit=15`, { signal: controller.signal });
        const salesData = (await salesRes.json()) as SalesApiResponse;
        if (page === 1) setSales([...offlineMapped,...salesData.sales]); else setSales((prev) => [...prev,...salesData.sales]);
        setTotal(salesData.total + offlineMapped.reduce((a, b) => a + b.total, 0)); setProfit(salesData.profit + offlineMapped.reduce((a, b) => a + b.profit, 0)); setPagination(salesData.pagination);
      } catch (err) { if ((err as Error).name!== "AbortError") console.error(err); } finally { setLoading(false); setLoadingMore(false); }
    }; void fetchData(); return () => controller.abort();
  }, [filter, page]);

  const sell = async (p: Product) => {
    if (sellingId) return;
    const calc = getSellCalc(p);
    if (calc.qtyMain < 0.001 && calc.qtySub < 0.001) { window.alert("Enter quantity"); return; }
    if (p.stock < calc.qtyMain - 0.0001) { window.alert(`Only ${p.stock.toFixed(2)} ${p.unit} left`); return; }
    const offlineUser = getOfflineUser(); const localId = generateLocalId(); const now = new Date().toISOString();
    const newSale: Sale = {
      _id: localId, productId: p._id, productName: p.name, quantity: calc.qtyMain, quantityInSub: calc.qtySub,
      unit: p.unit, subUnit: p.subUnit, isPartialSale: calc.mode === "sub", price: calc.sellPricePerMain,
      buyPrice: p.buyPrice, sellPrice: calc.sellPricePerMain, profit: calc.profit, total: calc.total, createdAt: now, localId, qtyPerUnit: p.qtyPerUnit
    };
    setSellingId(p._id);
    setProducts((prev) => prev.map((prod) => (prod._id === p._id? {...prod, stock: prod.stock - calc.qtyMain } : prod)));
    setSales((prev) => [newSale,...prev]);
    setTotal((t) => t + calc.total);
    setProfit((pr) => pr + calc.profit);
    setSubQtyMap((prev) => ({...prev, [p._id]: 0}));
    setTimeout(() => setSellingId(null), 400);
    const offlineSale: OfflineSale = {
      localId, productId: p._id, productName: p.name, quantity: calc.qtyMain, price: calc.sellPricePerMain, buyPrice: p.buyPrice, sellPrice: calc.sellPricePerMain,
      profit: calc.profit, total: calc.total, soldBy: offlineUser?.name || "shop", customerName: "Walk-in", paymentType: "cash",
      createdAt: now, offlineCreatedAt: now, synced: 0, userId: offlineUser?._id || "offline",
      unit: p.unit, subUnit: p.subUnit, qtyPerUnit: p.qtyPerUnit, quantityInSub: calc.qtySub, isPartialSale: calc.mode === "sub", pricePerSub: calc.pricePerSub,
    };
    void (async () => {
      try {
        await offlineDB.sales.put(offlineSale);
        await offlineDB.products.where("_id").equals(p._id).or("localId").equals(p._id).modify((prod) => { prod.stock -= calc.qtyMain; });
        if (typeof window!== "undefined" && window.navigator.onLine) {
          const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p._id, productName: p.name, quantity: calc.qtyMain, quantityInSub: calc.qtySub, unit: p.unit, subUnit: p.subUnit, qtyPerUnit: p.qtyPerUnit, isPartialSale: calc.mode === "sub", pricePerSub: calc.pricePerSub, price: calc.sellPricePerMain, buyPrice: p.buyPrice, sellPrice: calc.sellPricePerMain, profit: calc.profit, total: calc.total, localId }) });
          if (res.ok) await offlineDB.sales.update(localId, { synced: 1 });
        } else setPendingCount((c) => c + 1);
      } catch { setPendingCount((c) => c + 1); }
    })();
  };

  const handleDeleteSale = async (id: string) => {
    if (!window.confirm("Delete sale and restore stock?")) return;
    setDeletingId(id);
    try {
      const saleToDelete = sales.find((s) => s._id === id);
      const qtyToRestore = saleToDelete?.quantity?? 0;
      const productId = saleToDelete?.productId;
      setSales((prev) => prev.filter((s) => s._id!== id));
      if (saleToDelete) { setTotal((t) => t - saleToDelete.total); setProfit((pr) => pr - saleToDelete.profit); }
      if (productId) setProducts((prev) => prev.map((p) => (p._id === productId? {...p, stock: p.stock + qtyToRestore } : p)));
      if (id.startsWith("local_")) {
        await offlineDB.sales.delete(id);
        if (productId) await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify((prod) => { prod.stock += qtyToRestore; });
        setPendingCount((c) => Math.max(0, c - 1));
      } else {
        const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        if (productId) await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify((prod) => { prod.stock += qtyToRestore; });
      }
    } catch (e) {
      window.alert((e as Error).message || "Delete failed");
      void refreshSalesOnly();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b px-3 sm:px-4 lg:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[16px] sm:text-[18px] font-bold truncate">💰 Sales - Fast ⚡ {isOffline? "📶 Offline" : ""}</h1>
            <div className="flex gap-1.5 shrink-0">
              <div className="bg-green-600 text-white px-2.5 sm:px-3.5 py-2 rounded-xl font-bold text-[11px] sm:text-[12px]">{filter.toUpperCase()}: Rs.{total.toFixed(0)}</div>
              <div className="bg-blue-600 text-white px-2.5 sm:px-3.5 py-2 rounded-xl font-bold text-[11px] sm:text-[12px]">+Rs.{profit.toFixed(0)}</div>
            </div>
          </div>
          {mounted && (isOffline || pendingCount > 0) && (
            <div className={`text-[11px] p-2 rounded-xl flex justify-between items-center ${isOffline? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
              <span>{isOffline? `📶 Offline Mode Active • ${pendingCount} pending • Products from cache` : `${pendingCount} pending`}</span>
              {!isOffline && <button onClick={() => syncPendingSales()} disabled={syncing} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[11px]">{syncing? "..." : "Sync"}</button>}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-2 sm:p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <h2 className="font-semibold text-[13px] flex-1 hidden sm:block">Quick Sell - Instant ⚡ {isOffline? "(Offline Products)" : ""}</h2>
          <input placeholder="🔍 Search product..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} className="border p-3 sm:p-2.5 rounded-xl w-full sm:w-64 bg-white text-[14px] sm:text-[13px] h-11 sm:h-auto" />
        </div>

        {products.length === 0? <p className="text-center text-gray-400 py-8 bg-white rounded-xl border mb-5 text-[12px]">{loadingMoreProducts? "Loading products..." : isOffline? "No cached products - go online once to cache" : "No products"}</p> : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 mb-3">
              {products.map((p) => {
                const mode = modeMap[p._id] || "main"; const qtyPerUnit = p.qtyPerUnit || (p.unit === "bag"? 50 : p.unit === "kg"? 1 : 1000); const subUnit = p.subUnit || (p.unit === "bag"? "kg" : p.unit === "bottle"? "ml" : p.unit);
                const calc = getSellCalc(p); const outOfStock = p.stock <= 0.001; const isBag = p.unit === "bag"; const isBottle = p.unit === "bottle";
                const mainQty = qtyMap[p._id] || 1; const subQty = subQtyMap[p._id] || 0; const isSelling = sellingId === p._id; const isSub = mode === "sub";
                return (
                  <div key={p._id} className={`bg-white border rounded-2xl sm:rounded-xl p-3 shadow-sm flex flex-col ${isSelling? "ring-2 ring-green-400" : ""}`}>
                    <div className="flex justify-between gap-2 items-start">
                      <p className="font-semibold text-[14px] sm:text-[13px] flex-1 leading-tight line-clamp-2">{p.name}</p>
                      <span className="text-[9px] bg-gray-100 px-2 py-1 rounded-full h-fit shrink-0">{isBag? `${qtyPerUnit}kg/bag` : isBottle? `${qtyPerUnit >= 1000? qtyPerUnit / 1000 + "L" : qtyPerUnit + "ml"}/btl` : `${qtyPerUnit}${subUnit}`}</span>
                    </div>
                    <p className="text-[11px] sm:text-[10px] text-gray-500 mt-1">Stock: {p.stock.toFixed(1)} {p.unit} • {(p.stock * qtyPerUnit).toFixed(0)}{subUnit} {outOfStock? "• OUT" : ""}</p>
                    {(isBag || isBottle) && (
                      <div className="flex bg-gray-100 rounded-full p-1 mt-2.5 w-fit">
                        <button onClick={() => { setModeMap({...modeMap, [p._id]: "main"}); setPriceMap({...priceMap, [p._id]: String(p.sellPrice)}); }} className={`px-4 sm:px-3 py-1.5 sm:py-1 rounded-full text-[12px] sm:text-[11px] min-h-8 ${mode === "main"? "bg-green-600 text-white shadow" : "text-gray-600"}`}>{isBag? "Bag" : "Bottle"}</button>
                        <button onClick={() => { setModeMap({...modeMap, [p._id]: "sub"}); setPriceMap({...priceMap, [p._id]: String(p.sellPrice / qtyPerUnit)}); }} className={`px-4 sm:px-3 py-1.5 sm:py-1 rounded-full text-[12px] sm:text-[11px] min-h-8 ${mode === "sub"? "bg-blue-600 text-white shadow" : "text-gray-600"}`}>{isBag? "Kg" : "ml"}</button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 mt-3 text-[11px] sm:text-[10px]">
                      <div className="bg-red-50 p-2 sm:p-1.5 rounded-xl sm:rounded-lg text-center border border-red-100">
                        <span className="text-[10px] sm:text-[9px] text-gray-500">Buy</span><br/>
                        <b className="text-red-600 text-[12px] sm:text-[11px]">Rs.{(isSub? calc.buyPerSub : calc.buyPerMain).toFixed(isSub? 2 : 0)}</b><br/>
                        <span className="text-[8px] text-gray-400">{isSub? `/${subUnit}` : isBag? "/bag" : isBottle? "/btl" : `/${p.unit}`}</span>
                      </div>
                      <div className="bg-blue-50 p-2 sm:p-1.5 rounded-xl sm:rounded-lg text-center border border-blue-100">
                        <span className="text-[10px] sm:text-[9px] text-gray-500">Sell</span><br/>
                        <b className="text-blue-600 text-[12px] sm:text-[11px]">Rs.{(isSub? calc.pricePerSub : calc.sellPricePerMain).toFixed(isSub? 2 : 0)}</b><br/>
                        <span className="text-[8px] text-gray-400">{isSub? `/${subUnit}` : isBag? "/bag" : isBottle? "/btl" : `/${p.unit}`}</span>
                      </div>
                      <div className="bg-green-50 p-2 sm:p-1.5 rounded-xl sm:rounded-lg text-center border border-green-100">
                        <span className="text-[10px] sm:text-[9px] text-gray-500">Profit</span><br/>
                        <b className="text-green-700 text-[12px] sm:text-[11px]">Rs.{((isSub? calc.pricePerSub : calc.sellPricePerMain) - (isSub? calc.buyPerSub : calc.buyPerMain)).toFixed(isSub? 2 : 0)}</b><br/>
                        <span className="text-[8px] text-gray-400">{isSub? `/${subUnit}` : "/sale"}</span>
                      </div>
                    </div>
                    <div className="bg-gray-50 border rounded-xl p-2.5 mt-2.5 flex justify-between text-[12px] sm:text-[10px] font-medium">
                      <span>Bill {isSub? `${subQty}${subUnit}` : `x${mainQty}`}</span>
                      <span className="font-bold text-green-700">Rs.{calc.total.toFixed(0)} <span className="text-[10px]">+{calc.profit.toFixed(0)}</span></span>
                    </div>
                    <div className="flex gap-2 mt-3 items-center">
                      {mode === "main"? (
                        <div className="flex items-center border rounded-xl overflow-hidden shrink-0 h-11 sm:h-auto">
                          <button onClick={() => setQtyMap({...qtyMap, [p._id]: Math.max(0.05, (qtyMap[p._id] || 1) - 1)})} className="px-4 sm:px-3 py-3 sm:py-2 bg-gray-50 font-bold text-[14px]">-</button>
                          <input type="number" inputMode="decimal" step="0.05" value={qtyMap[p._id] || 1} onChange={(e) => setQtyMap({...qtyMap, [p._id]: Number(e.target.value) || 0.05})} className="w-16 sm:w-14 text-center p-2 text-[14px] sm:text-[12px] border-x outline-none h-full" />
                          <button onClick={() => setQtyMap({...qtyMap, [p._id]: Math.min(p.stock, (qtyMap[p._id] || 1) + 1)})} className="px-4 sm:px-3 py-3 sm:py-2 bg-gray-50 font-bold text-[14px]">+</button>
                        </div>
                      ) : (
                        <div className="flex items-center border rounded-xl bg-blue-50 border-blue-200 overflow-hidden h-11 sm:h-auto flex-1 sm:flex-none">
                          <input type="number" inputMode="decimal" placeholder={isBag? "Kg" : "ml"} value={subQtyMap[p._id] || ""} onChange={(e) => setSubQtyMap({...subQtyMap, [p._id]: Number(e.target.value) || 0})} className="w-full sm:w-20 p-2 text-[14px] sm:text-[12px] font-bold text-center bg-blue-50 outline-none h-full" />
                          <span className="px-3 text-[12px] font-bold text-blue-700 shrink-0">{subUnit}</span>
                        </div>
                      )}
                      <input value={priceMap[p._id]?? (isSub? String(p.sellPrice / qtyPerUnit) : String(p.sellPrice))} onChange={(e) => setPriceMap({...priceMap, [p._id]: e.target.value.replace(/[^0-9.]/g, "")})} className="w-18 sm:w-16 border border-amber-300 bg-amber-50 rounded-xl p-2 text-[12px] sm:text-[11px] font-bold text-center h-11 sm:h-auto" placeholder={isSub? `Rs/${subUnit}` : "Price"} />
                      <button onClick={() => sell(p)} disabled={outOfStock || isSelling} className={`flex-1 rounded-xl text-[13px] sm:text-[11px] h-11 sm:h-auto sm:py-2.5 font-bold ${outOfStock? "bg-gray-200 text-gray-500" : isSelling? "bg-green-300 text-white" : "bg-green-600 text-white"}`}>{isSelling? "..." : isSub? `Sell ${subQty || 0}` : "Sell"}</button>
                    </div>
                    {isSub && subQty > 0 && (
                      <p className="text-[10px] text-blue-600 mt-1 text-center">
                        {calc.isTotalInput? `Total Rs.${(calc.pricePerSub * subQty).toFixed(0)} → Rs.${calc.pricePerSub.toFixed(2)}/${subUnit} • ` : ""}
                        {subQty}{subUnit} = {(subQty / qtyPerUnit).toFixed(3)} {p.unit} • Bill Rs.{calc.total.toFixed(0)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {productPagination.hasMore && <button onClick={() => setProductPage((pr) => pr + 1)} disabled={loadingMoreProducts} className="w-full mb-6 py-3 sm:py-2.5 bg-white border border-green-600 text-green-700 rounded-xl text-[13px] sm:text-[12px] font-medium disabled:opacity-50 h-12 sm:h-auto">{loadingMoreProducts? "Loading..." : isOffline? `Load More Offline (${productPagination.totalCount - products.length})` : `Load More (${productPagination.totalCount - products.length})`}</button>}
          </>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 mt-4">
          <h2 className="font-bold text-[14px] capitalize flex-1 order-2 sm:order-1">{filter} - Rs.{total.toFixed(0)} | Profit Rs.{profit.toFixed(0)} {loading? "(...)" : ""}</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2 sm:pb-1 order-1 sm:order-2 -mx-2 px-2 sm:mx-0 sm:px-0">{FILTERS.map((f) => (<button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`px-4 sm:px-3 py-2 sm:py-1.5 rounded-full text-[12px] sm:text-[11px] capitalize whitespace-nowrap min-h-9 ${filter === f? "bg-green-600 text-white" : "bg-white border"}`}>{f}</button>))}</div>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl shadow-sm border overflow-hidden">
          {sales.length === 0? <p className="p-8 text-center text-gray-400 text-[13px]">No sales for {filter}</p> : (
            <>
              {sales.map((s) => {
                const isPartial =!!s.isPartialSale &&!!s.quantityInSub;
                const leftPrice = isPartial? s.total : s.sellPrice;
                const actualBuy = isPartial? (s.buyPrice * (s.quantity || 0)) : s.buyPrice;
                const qtyPerUnit = s.qtyPerUnit || (s.quantity && s.quantityInSub? s.quantityInSub / s.quantity : (s.subUnit === "ml"? 400 : 50));
                const isDeleting = deletingId === s._id;
                return (
                  <div key={s._id} className={`p-3 border-b last:border-0 ${s._id.startsWith("local_")? "bg-amber-50/50" : ""} ${isDeleting? "opacity-60 bg-red-50" : ""}`}>
                    <div className="flex justify-between gap-3 items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-[13px] leading-tight">
                          {s.productName} {isPartial? `(${s.quantityInSub}${s.subUnit})` : `x${(s.quantity || 1).toFixed(1)}`} @Rs.{leftPrice.toFixed(0)}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">{mounted? new Date(s.createdAt).toLocaleString() : ""} {s._id.startsWith("local_") && <span className="bg-amber-200 px-1.5 py-0.5 rounded-full text-[9px] ml-1">OFFLINE</span>}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {isPartial? `Product: 1 ${s.unit || 'btl'} = ${qtyPerUnit.toFixed(0)}${s.subUnit} • ${s.quantityInSub}${s.subUnit} = ${(s.quantity || 0).toFixed(3)} ${s.unit} • Buy Rs.${actualBuy.toFixed(0)} → Sell Rs.${s.total.toFixed(0)}`
                          : `Buy Rs.${s.buyPrice.toFixed(0)} → Sell Rs.${s.sellPrice.toFixed(0)} • Stock ${s.quantity?.toFixed(1)} ${s.unit || ''}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0 min-w-[90px]">
                        <div className="font-bold text-[14px]">Rs.{s.total.toFixed(0)}</div>
                        <div className="text-[12px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1 inline-block">+{s.profit.toFixed(0)} profit</div>
                        <div className="text-[10px] text-gray-400 mt-1">{isPartial? `${s.quantityInSub}${s.subUnit}` : `${s.quantity?.toFixed(1)} ${s.unit || ''}`}</div>
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <button onClick={() => handleDeleteSale(s._id)} disabled={isDeleting} className={`text-[11px] px-4 py-1.5 rounded-lg font-medium flex items-center gap-1 ${isDeleting? "bg-gray-200 text-gray-500" : "text-red-600 bg-red-50 hover:bg-red-100"}`}>
                        {isDeleting? <><span className="animate-spin h-3 w-3 border border-gray-400 border-t-transparent rounded-full"></span> Deleting...</> : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {pagination.hasMore && <div className="p-2.5 bg-gray-50"><button onClick={() => setPage((p) => p + 1)} disabled={loadingMore} className="w-full py-3 bg-white border rounded-xl text-[13px] font-medium h-12">{loadingMore? "Loading..." : `Load More (${pagination.totalCount - sales.length})`}</button></div>}
            </>
          )}
        </div>
        <div className="h-20 sm:h-0" />
      </div>
    </div>
  );
}
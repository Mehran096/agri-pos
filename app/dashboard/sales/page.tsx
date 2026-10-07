"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { offlineDB, OfflineProduct, OfflineSale } from "@/lib/offline-db";
import { getOfflineUser } from "@/lib/offline-auth";

type Product = { _id: string; name: string; price: number; stock: number; unit: string };
type Sale = { _id: string; productId: string; productName: string; quantity: number; price: number; total: number; createdAt: string; localId?: string; synced?: number };
type FilterType = "today" | "yesterday" | "weekly" | "monthly" | "yearly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type ProductsResponse = Product[] | { products: Product[]; pagination: Pagination };
type ErrorResponse = { error: string };

const FILTERS: FilterType[] = ["today", "yesterday", "weekly", "monthly", "yearly", "all"];
const PRODUCTS_PER_PAGE = 8;

function useIsOnline() {
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

function generateLocalId() {
  if (typeof crypto!== "undefined" && "randomUUID" in crypto) {
    return `local_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
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
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const refreshSalesOnly = useCallback(async () => {
    setPage(1);
    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
      const mapped: Sale[] = offlineSales.map((o) => ({
        _id: o.localId, productId: o.productId, productName: o.productName,
        quantity: o.quantity, price: o.price, total: o.total, createdAt: o.createdAt, localId: o.localId, synced: 0,
      }));
      setSales(mapped);
      setTotal(mapped.reduce((a, b) => a + b.total, 0));
      return;
    }
    const salesRes = await fetch(`/api/sales?filter=${filter}&page=1&limit=15`);
    const salesData = (await salesRes.json()) as { sales: Sale[]; total: number; pagination: Pagination };
    setSales(salesData.sales);
    setTotal(salesData.total);
    setPagination(salesData.pagination);
  }, [filter]);

  const syncPendingSales = useCallback(async () => {
    if (typeof window === "undefined" ||!window.navigator.onLine) return;
    const pending = await offlineDB.sales.where("synced").equals(0).toArray();
    if (pending.length === 0) return;
    setSyncing(true);
    let synced = 0;
    for (const s of pending) {
      try {
        const res = await fetch("/api/sales", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: s.productId, productName: s.productName, quantity: s.quantity, price: s.price,
            localId: s.localId, customerName: s.customerName, paymentType: s.paymentType,
            offlineCreatedAt: s.createdAt, soldBy: s.soldBy,
          }),
        });
        if (res.ok) { await offlineDB.sales.update(s.localId, { synced: 1 }); synced++; }
      } catch {}
    }
    setPendingCount((prev) => Math.max(0, prev - synced));
    setSyncing(false);
    if (synced > 0) void refreshSalesOnly();
  }, [refreshSalesOnly]);

  useEffect(() => {
    if (!mounted) return;
    let isMounted = true;
    const init = async () => {
      const count = await offlineDB.sales.where("synced").equals(0).count();
      if (isMounted) setPendingCount(count);
    };
    void init();
    const handleOnline = () => { void syncPendingSales(); };
    window.addEventListener("online", handleOnline);
    return () => { isMounted = false; window.removeEventListener("online", handleOnline); };
  }, [mounted, syncPendingSales]);

  useEffect(() => {
    const controller = new AbortController();
    const loadProducts = async () => {
      const cached = await offlineDB.products.toArray();
      const offlineMapped: Product[] = cached.map((c: OfflineProduct) => ({
        _id: c._id || c.localId, name: c.name, price: c.price, stock: c.stock, unit: c.unit,
      })).filter((p) =>!productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()));

      if (typeof window!== "undefined" &&!window.navigator.onLine) {
        const paged = offlineMapped.slice(0, productPage * PRODUCTS_PER_PAGE);
        setProducts(paged);
        setProductPagination({
          page: productPage,
          totalPages: Math.ceil(offlineMapped.length / PRODUCTS_PER_PAGE),
          hasMore: paged.length < offlineMapped.length,
          totalCount: offlineMapped.length
        });
        setLoadingMoreProducts(false);
        return;
      }

      try {
        setLoadingMoreProducts(true);
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&page=${productPage}&limit=${PRODUCTS_PER_PAGE}`, { signal: controller.signal });
        const data = await res.json() as ProductsResponse;
        if (Array.isArray(data)) {
          const paged = data.slice(0, productPage * PRODUCTS_PER_PAGE);
          setProducts(paged);
          setProductPagination({ page: productPage, totalPages: Math.ceil(data.length / PRODUCTS_PER_PAGE), hasMore: paged.length < data.length, totalCount: data.length });
        } else {
          if (productPage === 1) setProducts(data.products);
          else setProducts((prev) => [...prev,...data.products]);
          setProductPagination(data.pagination);
        }

        if (productPage === 1) {
          try {
            const allRes = await fetch(`/api/products?limit=100`, { signal: controller.signal });
            const allData = await allRes.json() as ProductsResponse;
            const allList = Array.isArray(allData)? allData : allData.products;
            const unsynced = cached.filter(c => c.synced === 0);
            await offlineDB.products.clear();
            await offlineDB.products.bulkAdd([
          ...unsynced,
          ...allList.map(p => ({ _id: p._id, localId: p._id, name: p.name, price: p.price, stock: p.stock, unit: p.unit, userId: "cached", synced: 1 as const }))
            ]);
          } catch {}
        }
      } catch (err) { if ((err as Error).name!== "AbortError") console.error(err); }
      finally { setLoadingMoreProducts(false); }
    };
    void loadProducts();
    return () => controller.abort();
  }, [productSearch, productPage]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      if (page === 1) setLoading(true); else setLoadingMore(true);
      try {
        const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
        const offlineMapped: Sale[] = offlineSales.map((o) => ({
          _id: o.localId, productId: o.productId, productName: o.productName, quantity: o.quantity,
          price: o.price, total: o.total, createdAt: o.createdAt, localId: o.localId, synced: 0,
        }));
        if (typeof window!== "undefined" &&!window.navigator.onLine) {
          setSales(offlineMapped);
          setTotal(offlineMapped.reduce((a, b) => a + b.total, 0));
          setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: offlineMapped.length });
          return;
        }
        const salesRes = await fetch(`/api/sales?filter=${filter}&page=${page}&limit=15`, { signal: controller.signal });
        const salesData = (await salesRes.json()) as { sales: Sale[]; total: number; pagination: Pagination };
        if (page === 1) setSales([...offlineMapped,...salesData.sales]); else setSales((prev) => [...prev,...salesData.sales]);
        setTotal(salesData.total + offlineMapped.reduce((a, b) => a + b.total, 0));
        setPagination(salesData.pagination);
      } catch (err) { if ((err as Error).name!== "AbortError") console.error(err); }
      finally { setLoading(false); setLoadingMore(false); }
    };
    void fetchData();
    return () => controller.abort();
  }, [filter, page]);

  useEffect(() => {
    if (!mounted) return;
    if (!isOffline) return;
    const switchSalesOffline = async () => {
      const offlineSales = await offlineDB.sales.where("synced").equals(0).reverse().toArray();
      const mapped: Sale[] = offlineSales.map((o) => ({
        _id: o.localId, productId: o.productId, productName: o.productName,
        quantity: o.quantity, price: o.price, total: o.total, createdAt: o.createdAt, localId: o.localId, synced: 0,
      }));
      setSales(mapped);
      setTotal(mapped.reduce((a, b) => a + b.total, 0));
      setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: mapped.length });
      setPage(1);
    };
    void switchSalesOffline();
  }, [isOffline, mounted]);

  const sell = async (p: Product) => {
    const quantity = qtyMap[p._id] || 1;
    const currentStock = p.stock?? 0;
    if (currentStock <= 0) { window.alert(`${p.name} is out of stock!`); return; }
    if (quantity > currentStock) { window.alert(`Only ${currentStock} left for ${p.name}`); return; }
    const offlineUser = getOfflineUser();
    const localId = generateLocalId();
    const now = new Date().toISOString();

    setProducts((prev) => prev.map((prod) => (prod._id === p._id? {...prod, stock: prod.stock - quantity } : prod)));

    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const offlineSale: OfflineSale = {
        localId, productId: p._id, productName: p.name, quantity, price: p.price, total: quantity * p.price,
        soldBy: offlineUser?.name || "shop", customerName: "Walk-in", paymentType: "cash",
        createdAt: now, offlineCreatedAt: now, synced: 0, userId: offlineUser?._id || "offline",
      };
      await offlineDB.sales.put(offlineSale);
      await offlineDB.products.where("_id").equals(p._id).or("localId").equals(p._id).modify((prod) => { prod.stock -= quantity; });
      setPendingCount((c) => c + 1);
      await refreshSalesOnly();
      return;
    }
    try {
      const res = await fetch("/api/sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p._id, productName: p.name, quantity, price: p.price, localId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as ErrorResponse;
        window.alert(err.error || "Sale failed");
        setProducts((prev) => prev.map((prod) => (prod._id === p._id? {...prod, stock: prod.stock + quantity } : prod)));
        return;
      }
      await offlineDB.products.where("_id").equals(p._id).or("localId").equals(p._id).modify((prod) => { prod.stock -= quantity; });
    } catch {
      const offlineSale: OfflineSale = {
        localId, productId: p._id, productName: p.name, quantity, price: p.price, total: quantity * p.price,
        soldBy: offlineUser?.name || "shop", customerName: "Walk-in", paymentType: "cash",
        createdAt: now, offlineCreatedAt: now, synced: 0, userId: offlineUser?._id || "offline",
      };
      await offlineDB.sales.put(offlineSale);
      setPendingCount((c) => c + 1);
    }
    await refreshSalesOnly();
  };

  const handleDeleteSale = async (id: string) => {
    if (!window.confirm("Delete sale and restore stock?")) return;
    setDeletingId(id);
    try {
      const saleToDelete = sales.find(s => s._id === id);
      const qtyToRestore = saleToDelete?.quantity?? 0;
      const productId = saleToDelete?.productId;
      if (id.startsWith("local_")) {
        await offlineDB.sales.delete(id);
        if (productId) {
          await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify(p => { p.stock += qtyToRestore; });
          setProducts(prev => prev.map(p => p._id === productId? {...p, stock: p.stock + qtyToRestore } : p));
        }
        setPendingCount((c) => Math.max(0, c - 1));
      } else {
        const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        if (productId) {
          await offlineDB.products.where("_id").equals(productId).or("localId").equals(productId).modify(p => { p.stock += qtyToRestore; });
          setProducts(prev => prev.map(p => p._id === productId? {...p, stock: p.stock + qtyToRestore } : p));
        }
      }
      await refreshSalesOnly();
    } finally { setDeletingId(null); }
  };

  const handleUpdateQty = async (sale: Sale, newQty: number) => {
    if (newQty < 1) return;
    let currentStock = 0;
    const productInList = products.find(p => p._id === sale.productId);
    if (productInList) {
      currentStock = productInList.stock?? 0;
    } else {
      const cachedProd = await offlineDB.products.where("_id").equals(sale.productId).or("localId").equals(sale.productId).first();
      currentStock = cachedProd?.stock?? 0;
    }
    const maxAllowed = currentStock + sale.quantity;
    if (newQty > maxAllowed) {
      window.alert(`Only ${maxAllowed} total available. Shop: ${currentStock} left.`);
      return;
    }
    const delta = newQty - sale.quantity;
    setUpdatingId(sale._id);
    try {
      if (sale._id.startsWith("local_")) {
        await offlineDB.sales.update(sale._id, { quantity: newQty, total: newQty * sale.price });
        await offlineDB.products.where("_id").equals(sale.productId).or("localId").equals(sale.productId).modify(p => { p.stock -= delta; });
        setProducts(prev => prev.map(p => p._id === sale.productId? {...p, stock: p.stock - delta } : p));
        await refreshSalesOnly();
        return;
      }
      const res = await fetch(`/api/sales/${sale._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty })
      });
      if (!res.ok) {
        const err = (await res.json()) as ErrorResponse;
        window.alert(err.error || "Not enough stock");
        return;
      }
      await offlineDB.products.where("_id").equals(sale.productId).or("localId").equals(sale.productId).modify(p => { p.stock -= delta; });
      setProducts(prev => prev.map(p => p._id === sale.productId? {...p, stock: p.stock - delta } : p));
      await refreshSalesOnly();
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {mounted && isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center font-medium">📶 Offline Mode • {pendingCount} pending sync</div>}
      {mounted && pendingCount > 0 &&!isOffline && (
        <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl text-center font-medium flex justify-between items-center">
          <span>{pendingCount} offline sales pending</span>
          <button onClick={() => syncPendingSales()} disabled={syncing} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[11px] disabled:opacity-50">{syncing? "Syncing..." : "Sync Now"}</button>
        </div>
      )}
      <div className="flex flex-col gap-2.5 mb-4">
        <h1 className="text-[19px] font-bold">💰 Sales Point</h1>
        <div className="bg-green-600 text-white px-3.5 py-2 rounded-xl font-bold text-[13px] w-fit" suppressHydrationWarning>{filter.toUpperCase()}: Rs. {total} • {pagination.totalCount + pendingCount}</div>
      </div>
      <div className="flex flex-col gap-2 mb-3">
        <h2 className="font-semibold text-[13px]">Quick Sell</h2>
        <input placeholder="🔍 Search products..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} className="border p-2.5 rounded-xl w-full bg-white text-[13px]" />
      </div>
      {products.length === 0? <p className="text-center text-gray-400 py-8 bg-white rounded-xl border mb-5 text-[12px]">No products</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
            {products.map((p) => {
              const stock = p.stock?? 0;
              const qty = qtyMap[p._id] || 1;
              const outOfStock = stock <= 0;
              const notEnough = qty > stock;
              return (
                <div key={p._id} className="bg-white border rounded-xl p-3 shadow-sm flex flex-col">
                  <div className="flex justify-between"><p className="font-semibold text-[13px]">{p.name}</p><span className={`text-[10px] px-2 py-0.5 rounded-full ${outOfStock? "bg-red-100 text-red-600" : stock < 20? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}>{outOfStock? "0 left" : `${stock} left`}</span></div>
                  <p className="text-[11px] text-gray-500 mt-1">Rs. {p.price}/{p.unit}</p>
                  {/* ✅ MOBILE FIXED INPUT */}
                  <div className="flex gap-2 mt-2.5 items-center">
                    <div className="flex items-center border rounded-lg bg-white overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setQtyMap({...qtyMap, [p._id]: Math.max(1, (qtyMap[p._id] || 1) - 1)})}
                        disabled={outOfStock}
                        className="px-3.5 py-2 text-[15px] font-bold bg-gray-50 active:bg-gray-200 disabled:opacity-40"
                      >-</button>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={qty}
                        disabled={outOfStock}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          const num = v === ""? 1 : Math.max(1, Math.min(stock, Number(v)));
                          setQtyMap({...qtyMap, [p._id]: num});
                        }}
                        className="w-12 text-center p-2 text-[13px] border-x outline-none bg-white disabled:bg-gray-100"
                      />
                      <button
                        type="button"
                        onClick={() => setQtyMap({...qtyMap, [p._id]: Math.min(stock || 1, (qtyMap[p._id] || 1) + 1)})}
                        disabled={outOfStock}
                        className="px-3.5 py-2 text-[15px] font-bold bg-gray-50 active:bg-gray-200 disabled:opacity-40"
                      >+</button>
                    </div>
                    <button onClick={() => sell(p)} disabled={outOfStock || notEnough} className={`flex-1 rounded-lg font-medium text-[12px] py-2.5 transition ${outOfStock || notEnough? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 active:bg-green-800 text-white"}`}>{outOfStock? "Out of Stock" : notEnough? `Only ${stock} left` : "Sell"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          {productPagination.hasMore && (
            <button onClick={() => setProductPage(pr => pr + 1)} disabled={loadingMoreProducts} className="w-full mb-6 py-2.5 bg-white border border-green-600 text-green-700 rounded-xl text-[12px] font-medium hover:bg-green-50 disabled:opacity-50">
              {loadingMoreProducts? "Loading..." : `Load More Products (${productPagination.totalCount - products.length} more) ↓`}
            </button>
          )}
          <p className="text-center text-[10px] text-gray-400 mb-6">{products.length} / {productPagination.totalCount} products</p>
        </>
      )}
      <div className="flex flex-col gap-2 mb-3">
        <h2 className="font-bold text-[14px] capitalize">{filter} Records</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map((f) => (<button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`px-3 py-1.5 rounded-full text-[11px] capitalize ${filter === f? "bg-green-600 text-white" : "bg-white border"}`}>{f}</button>))}</div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {sales.length === 0 &&!loading? <p className="p-6 text-center text-gray-400 text-[12px]">No sales for {filter}</p> : (
          <>
            {sales.map((s) => {
              const prod = products.find(p => p._id === s.productId);
              const available = (prod?.stock?? 0) + s.quantity;
              const canInc = s.quantity < available;
              const canDec = s.quantity > 1;
              const isDeleting = deletingId === s._id;
              const isUpdating = updatingId === s._id;
              return (
                <div key={s._id} className={`p-3 border-b last:border-0 flex flex-col gap-1.5 ${s._id.startsWith("local_")? "bg-amber-50/50" : ""} ${isDeleting? "opacity-50" : ""}`}>
                  <div className="flex justify-between"><p className="font-medium text-[12px]">{s.productName} <span className="text-gray-400 text-[11px]">x{s.quantity}</span> {s._id.startsWith("local_") && <span className="ml-1 text-[9px] bg-amber-200 px-1.5 py-0.5 rounded-full">OFFLINE</span>}</p><span className="font-bold text-[12px]">Rs. {s.total}</span></div>
                  <p className="text-[10px] text-gray-400" suppressHydrationWarning>{mounted? `${new Date(s.createdAt).toLocaleDateString()} • ${new Date(s.createdAt).toLocaleTimeString()}` : ""}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <button onClick={() => handleUpdateQty(s, s.quantity - 1)} disabled={!canDec || isUpdating || isDeleting} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold ${!canDec || isUpdating? "bg-gray-50 text-gray-300" : "bg-gray-100 active:bg-gray-200"}`}>-</button>
                    <span className="text-[11px] px-2 min-w-6 text-center">{s.quantity}</span>
                    <button onClick={() => handleUpdateQty(s, s.quantity + 1)} disabled={!canInc || isUpdating || isDeleting} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold ${!canInc || isUpdating? "bg-gray-50 text-gray-300" : "bg-gray-100 active:bg-gray-200"}`}>+</button>
                    {prod && <span className="ml-2 text-[10px] text-gray-400">{prod.stock} left • max {available}</span>}
                    <button onClick={() => handleDeleteSale(s._id)} disabled={isDeleting || isUpdating} className={`ml-auto text-[11px] px-2.5 py-1 rounded-lg ${isDeleting? "bg-gray-200 text-gray-400" : "text-red-500 bg-red-50 hover:bg-red-100"}`}>{isDeleting? "Deleting..." : "Delete"}</button>
                  </div>
                </div>
              );
            })}
            {pagination.hasMore && (<div className="p-2.5 bg-gray-50"><button onClick={() => setPage((p) => p + 1)} disabled={loadingMore} className="w-full py-2.5 bg-white border rounded-xl text-[12px] font-medium">{loadingMore? "Loading..." : `Load More Sales (${pagination.totalCount - sales.length})`}</button></div>)}
          </>
        )}
      </div>
    </div>
  );
}
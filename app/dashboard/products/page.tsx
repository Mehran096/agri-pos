"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { offlineDB, OfflineProduct } from "@/lib/offline-db";
import { getOfflineUser } from "@/lib/offline-auth";

type Product = {
  _id: string;
  name: string;
  price: number;
  buyPrice: number;
  sellPrice: number;
  profit?: number;
  profitPercent?: number;
  unit: string;
  stock?: number;
  localId?: string;
  synced?: number;
};

type FormState = { name: string; buyPrice: string; sellPrice: string; unit: string; stock: string };
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type ProductsResponse = { products: Product[]; pagination: Pagination } | Product[];

function generateLocalId(): string {
  if (typeof crypto!== "undefined" && "randomUUID" in crypto) {
    return `local_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function useIsOnline(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
      window.removeEventListener("online", cb);
      window.removeEventListener("offline", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => window.navigator.onLine, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function ProductsPage() {
  const isOnline = useIsOnline();
  const isOffline =!isOnline;

  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "100" });
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshAfterAction = useCallback(async (currentSearch: string) => {
    setPage(1);
    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const cached = await offlineDB.products.toArray();
      const filtered = cached
       .filter((c) =>!currentSearch || c.name.toLowerCase().includes(currentSearch.toLowerCase()))
       .map((c) => ({
          _id: c._id || c.localId,
          name: c.name,
          price: c.price,
          buyPrice: c.buyPrice || 0,
          sellPrice: c.sellPrice || c.price,
          unit: c.unit,
          stock: c.stock,
          localId: c.localId,
          synced: c.synced,
        }));
      setProducts(filtered);
      setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: filtered.length });
      return;
    }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(currentSearch)}&page=1&limit=20`);
      const data = (await res.json()) as ProductsResponse;
      if (Array.isArray(data)) {
        setProducts(data);
        setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: data.length });
      } else {
        setProducts(data.products);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const syncPendingProducts = useCallback(async () => {
    if (typeof window === "undefined" ||!window.navigator.onLine) return;
    const pending = await offlineDB.products.where("synced").equals(0).toArray();
    if (pending.length === 0) return;
    setSyncing(true);
    let synced = 0;
    for (const p of pending) {
      try {
        const isNew = p.localId.startsWith("local_");
        const url = isNew? "/api/products" : `/api/products/${p._id}`;
        const method = isNew? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            buyPrice: p.buyPrice?? Math.round(p.price * 0.75),
            sellPrice: p.sellPrice?? p.price,
            price: p.price,
            unit: p.unit,
            stock: p.stock,
            localId: p.localId,
          }),
        });
        if (res.ok) {
          await offlineDB.products.update(p.localId, { synced: 1 });
          synced++;
        }
      } catch {
        // keep for next try
      }
    }
    setPendingCount((prev) => Math.max(0, prev - synced));
    setSyncing(false);
    if (synced > 0) void refreshAfterAction(search);
  }, [refreshAfterAction, search]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (currentSearch: string, currentPage: number, signal: AbortSignal) => {
      if (currentPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const cached = await offlineDB.products.toArray();
        const offlineFiltered = cached
         .filter((c) =>!currentSearch || c.name.toLowerCase().includes(currentSearch.toLowerCase()))
         .map((c) => ({
            _id: c._id || c.localId,
            name: c.name,
            price: c.price,
            buyPrice: c.buyPrice || Math.round(c.price * 0.75),
            sellPrice: c.sellPrice || c.price,
            unit: c.unit,
            stock: c.stock,
            localId: c.localId,
            synced: c.synced,
          }));

        const offlineUnsyncedCount = cached.filter((c) => c.synced === 0).length;
        setPendingCount(offlineUnsyncedCount);

        if (currentPage === 1 && offlineFiltered.length > 0) {
          setProducts(offlineFiltered.slice(0, 20));
        }

        if (typeof window!== "undefined" &&!window.navigator.onLine) {
          const paged = offlineFiltered.slice(0, currentPage * 20);
          setProducts(paged);
          setPagination({ page: 1, totalPages: 1, hasMore: paged.length < offlineFiltered.length, totalCount: offlineFiltered.length });
          return;
        }

        const res = await fetch(`/api/products?search=${encodeURIComponent(currentSearch)}&page=${currentPage}&limit=20`, { signal });
        const data = (await res.json()) as ProductsResponse;
        if (Array.isArray(data)) {
          setProducts(data);
          setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: data.length });
          await offlineDB.products.clear();
          const toCache: OfflineProduct[] = data.map((p) => ({
            _id: p._id,
            localId: p._id,
            name: p.name,
            price: p.sellPrice || p.price,
            buyPrice: p.buyPrice || Math.round((p.sellPrice || p.price) * 0.75),
            sellPrice: p.sellPrice || p.price,
            stock: p.stock?? 0,
            unit: p.unit,
            userId: "cached",
            synced: 1,
          }));
          await offlineDB.products.bulkAdd(toCache);
        } else {
          if (currentPage === 1) setProducts([...offlineFiltered.filter((o) => o.synced === 0),...data.products]);
          else setProducts((prev) => [...prev,...data.products]);
          setPagination(data.pagination);
          if (currentPage === 1) {
            const syncedOnly = data.products;
            const unsynced = cached.filter((c) => c.synced === 0);
            await offlineDB.products.clear();
            const toCache: OfflineProduct[] = [
             ...unsynced,
             ...syncedOnly.map((p) => ({
                _id: p._id,
                localId: p._id,
                name: p.name,
                price: p.sellPrice || p.price,
                buyPrice: p.buyPrice || Math.round((p.sellPrice || p.price) * 0.75),
                sellPrice: p.sellPrice || p.price,
                stock: p.stock?? 0,
                unit: p.unit,
                userId: "cached",
                synced: 1 as const,
              })),
            ];
            await offlineDB.products.bulkAdd(toCache);
          }
        }
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };
    void load(search, page, controller.signal);
    return () => controller.abort();
  }, [search, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOnline) void syncPendingProducts();
  }, [isOnline, syncPendingProducts]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const buy = Number(form.buyPrice);
    const sell = Number(form.sellPrice);
    if (sell <= 0) {
      alert("Sell price required");
      return;
    }

    const payload = {
      name: form.name,
      buyPrice: buy,
      sellPrice: sell,
      price: sell,
      unit: form.unit,
      stock: Number(form.stock),
    };
    const offlineUser = getOfflineUser();

    if (typeof window!== "undefined" &&!window.navigator.onLine) {
      const localId = editId && editId.startsWith("local_")? editId : generateLocalId();
      const offlineProd: OfflineProduct = {
        _id: editId &&!editId.startsWith("local_")? editId : localId,
        localId,
        name: payload.name,
        price: payload.sellPrice,
        buyPrice: payload.buyPrice,
        sellPrice: payload.sellPrice,
        stock: payload.stock,
        unit: payload.unit,
        userId: offlineUser?._id || "offline",
        synced: 0,
      };
      await offlineDB.products.put(offlineProd);
      setPendingCount((c) => c + 1);
      setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "100" });
      setEditId(null);
      await refreshAfterAction(search);
      return;
    }

    try {
      const url = editId &&!editId.startsWith("local_")? `/api/products/${editId}` : "/api/products";
      const method = editId &&!editId.startsWith("local_")? "PUT" : "POST";
      const body = editId && editId.startsWith("local_")? {...payload, localId: editId } : payload;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("failed");
      if (editId && editId.startsWith("local_")) {
        await offlineDB.products.delete(editId);
      }
    } catch {
      const localId = editId || generateLocalId();
      const offlineProd: OfflineProduct = {
        _id: editId &&!editId.startsWith("local_")? editId : localId,
        localId,
        name: payload.name,
        price: payload.sellPrice,
        buyPrice: payload.buyPrice,
        sellPrice: payload.sellPrice,
        stock: payload.stock,
        unit: payload.unit,
        userId: offlineUser?._id || "offline",
        synced: 0,
      };
      await offlineDB.products.put(offlineProd);
      setPendingCount((c) => c + 1);
    }
    setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "100" });
    setEditId(null);
    await refreshAfterAction(search);
  };

  const handleEdit = (p: Product) => {
    setEditId(p._id);
    setForm({
      name: p.name,
      buyPrice: String(p.buyPrice || Math.round((p.sellPrice || p.price) * 0.75)),
      sellPrice: String(p.sellPrice || p.price),
      unit: p.unit,
      stock: String(p.stock?? 100),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this product?")) return;
    if (id.startsWith("local_")) {
      await offlineDB.products.delete(id);
      setPendingCount((c) => Math.max(0, c - 1));
      await refreshAfterAction(search);
      return;
    }
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
    } catch {
      await offlineDB.products.delete(id);
    }
    await refreshAfterAction(search);
  };

  const liveProfit = form.buyPrice && form.sellPrice? Number(form.sellPrice) - Number(form.buyPrice) : 0;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center font-medium">
          📶 Offline Mode • {pendingCount} pending sync
        </div>
      )}
      {pendingCount > 0 &&!isOffline && (
        <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl flex justify-between items-center">
          <span>{pendingCount} products pending sync</span>
          <button onClick={() => syncPendingProducts()} disabled={syncing} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[11px] disabled:opacity-50">
            {syncing? "Syncing..." : "Sync Now"}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <h1 className="text-[20px] sm:text-2xl md:text-3xl font-bold text-gray-800">🌾 Products</h1>
        <input
          placeholder="🔍 Search products..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="border border-gray-200 p-2.5 sm:p-2.5 rounded-xl w-full sm:w-72 focus:ring-2 focus:ring-green-500 outline-none bg-white text-[14px] shadow-sm"
        />
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100 mb-4 sm:mb-6">
        <p className="font-semibold mb-2 sm:mb-3 text-gray-700 text-[13px] sm:text-[15px]">
          {editId? "Edit Product" : "Add New Product"} {editId?.startsWith("local_") && <span className="ml-2 text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-3">
          <input placeholder="Name e.g. Sona DAP" value={form.name} onChange={(e) => setForm({...form, name: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg col-span-2 text-[13px] sm:text-[14px] focus:ring-2 focus:ring-green-500 outline-none" required />
          <input placeholder="Buy Rs." type="number" value={form.buyPrice} onChange={(e) => setForm({...form, buyPrice: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg text-[13px] sm:text-[14px] focus:ring-2 focus:ring-red-300 outline-none bg-red-50/50" required />
          <input placeholder="Sell Rs." type="number" value={form.sellPrice} onChange={(e) => setForm({...form, sellPrice: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg text-[13px] sm:text-[14px] focus:ring-2 focus:ring-blue-300 outline-none bg-blue-50/50" required />
          <select value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg bg-white text-[13px] sm:text-[14px]">
            <option value="bag">bag</option><option value="liter">liter</option><option value="kg">kg</option><option value="ml">ml</option>
          </select>
          <input placeholder="Stock" type="number" value={form.stock} onChange={(e) => setForm({...form, stock: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg text-[13px] sm:text-[14px] focus:ring-2 focus:ring-green-500 outline-none" />
        </div>

        {liveProfit!== 0 && (
          <p className={`mt-2 text-[12px] font-medium ${liveProfit > 0? "text-green-600" : "text-red-600"}`}>
            Profit: Rs. {liveProfit} {form.buyPrice && Number(form.buyPrice) > 0? `(${Math.round((liveProfit / Number(form.buyPrice)) * 100)}%)` : ""}
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition text-[13px] sm:text-[14px]">{editId? "Update" : "+ Add"}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "100" }); }} className="bg-gray-100 hover:bg-gray-200 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-[13px] sm:text-[14px]">Cancel</button>}
        </div>
      </form>

      {loading? <p className="text-center text-gray-400 py-10 text-[13px]">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {products.map((p) => {
              const sell = p.sellPrice || p.price;
              const buy = p.buyPrice || Math.round(sell * 0.75);
              const profit = sell - buy;
              return (
                <div key={p._id} className={`bg-white border border-gray-100 p-2.5 sm:p-4 rounded-xl shadow-sm hover:shadow-md transition flex flex-col ${p._id.startsWith("local_")? "bg-amber-50/60" : ""}`}>
                  <div className="flex justify-between items-start gap-1 mb-1">
                    <p className="font-semibold text-gray-800 text-[12px] sm:text-[14px] leading-tight line-clamp-2">{p.name} {p._id.startsWith("local_") && <span className="text-[8px] bg-amber-200 text-amber-800 px-1 py-0.5 rounded-full ml-1">OFFLINE</span>}</p>
                    {(p.stock?? 0) < 20 && <span className="text-[8px] sm:text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">Low</span>}
                  </div>

                  <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                    <div className="bg-red-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Buy</div>
                      <div className="font-bold text-red-600">Rs.{buy}</div>
                    </div>
                    <div className="bg-blue-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Sell</div>
                      <div className="font-bold text-blue-600">Rs.{sell}</div>
                    </div>
                    <div className="bg-green-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Profit</div>
                      <div className="font-bold text-green-600">Rs.{profit}</div>
                    </div>
                  </div>

                  <p className="text-[10px] sm:text-[12px] text-gray-400 mt-1">Stock: {p.stock?? 0} / {p.unit}</p>
                  <div className="flex gap-1.5 mt-2 sm:mt-3">
                    <button onClick={() => handleEdit(p)} className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">Edit</button>
                    <button onClick={() => handleDelete(p._id)} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">Del</button>
                  </div>
                </div>
              );
            })}
          </div>

          {pagination.hasMore && (
            <button onClick={() => setPage((pr) => pr + 1)} disabled={loadingMore} className="w-full mt-4 py-2.5 bg-white border border-gray-100 rounded-xl text-[13px] font-medium hover:bg-gray-50 disabled:opacity-50 shadow-sm">
              {loadingMore? "Loading..." : `More (${pagination.totalCount - products.length})`}
            </button>
          )}

          <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-4">{pagination.totalCount + pendingCount} total • {products.length} shown</p>
        </>
      )}
    </div>
  );
}
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
  unit: string;
  stock?: number;
  localId?: string;
  synced?: number;
  qtyPerUnit?: number;
  subUnit?: string;
  baseQtyInSub?: number;
};

type FormState = {
  name: string;
  buyPrice: string;
  sellPrice: string;
  unit: string;
  stock: string;
  qtyPerUnit: string;
  subUnit: string;
};

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

const BAG_SIZES = [20, 25, 40, 50];
const BOTTLE_SIZES = [
  { label: "500ml", qty: 500, sub: "ml", base: 500 },
  { label: "1L", qty: 1, sub: "liter", base: 1000 },
  { label: "1.5L", qty: 1.5, sub: "liter", base: 1500 },
  { label: "2L", qty: 2, sub: "liter", base: 2000 },
  { label: "1L (1000ml)", qty: 1000, sub: "ml", base: 1000 },
];

export default function ProductsPage() {
  const isOnline = useIsOnline();
  const isOffline =!isOnline;

  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "10", qtyPerUnit: "50", subUnit: "kg" });
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
          qtyPerUnit: (c as OfflineProduct).qtyPerUnit,
          subUnit: (c as OfflineProduct).subUnit,
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
            qtyPerUnit: p.qtyPerUnit || (p.unit === "bag"? 50 : 1000),
            subUnit: p.subUnit || (p.unit === "bag"? "kg" : "ml"),
            baseQtyInSub: p.baseQtyInSub || p.qtyPerUnit,
          }),
        });
        if (res.ok) {
          await offlineDB.products.update(p.localId, { synced: 1 });
          synced++;
        }
      } catch {}
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
            qtyPerUnit: c.qtyPerUnit,
            subUnit: c.subUnit,
          }));

        setPendingCount(cached.filter((c) => c.synced === 0).length);

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
            qtyPerUnit: p.qtyPerUnit || (p.unit === "bag"? 50 : 1000),
            subUnit: p.subUnit || (p.unit === "bag"? "kg" : "ml"),
            baseQtyInSub: p.baseQtyInSub,
          }));
          await offlineDB.products.bulkAdd(toCache);
        } else {
          if (currentPage === 1) setProducts([...offlineFiltered.filter((o) => o.synced === 0),...data.products]);
          else setProducts((prev) => [...prev,...data.products]);
          setPagination(data.pagination);
          if (currentPage === 1) {
            const unsynced = cached.filter((c) => c.synced === 0);
            await offlineDB.products.clear();
            const toCache: OfflineProduct[] = [
             ...unsynced,
             ...data.products.map((p) => ({
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
                qtyPerUnit: p.qtyPerUnit || (p.unit === "bag"? 50 : 1000),
                subUnit: p.subUnit || (p.unit === "bag"? "kg" : "ml"),
                baseQtyInSub: p.baseQtyInSub,
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

  const handleUnitChange = (unit: string) => {
    if (unit === "bag") setForm({...form, unit, qtyPerUnit: "50", subUnit: "kg" });
    else if (unit === "bottle") setForm({...form, unit, qtyPerUnit: "1000", subUnit: "ml" });
    else setForm({...form, unit });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const buy = Number(form.buyPrice);
    const sell = Number(form.sellPrice);
    if (sell <= 0) { alert("Sell price required"); return; }

    const qty = Number(form.qtyPerUnit) || (form.unit === "bag"? 50 : 1000);
    const sub = form.subUnit;
    const base = sub === "liter"? qty * 1000 : qty;

    const payload = {
      name: form.name,
      buyPrice: buy,
      sellPrice: sell,
      price: sell,
      unit: form.unit,
      stock: Number(form.stock),
      qtyPerUnit: qty,
      subUnit: sub,
      baseQtyInSub: base,
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
        qtyPerUnit: payload.qtyPerUnit,
        subUnit: payload.subUnit,
        baseQtyInSub: payload.baseQtyInSub,
      };
      await offlineDB.products.put(offlineProd);
      setPendingCount((c) => c + 1);
      setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "10", qtyPerUnit: "50", subUnit: "kg" });
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
      if (editId && editId.startsWith("local_")) await offlineDB.products.delete(editId);
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
        qtyPerUnit: payload.qtyPerUnit,
        subUnit: payload.subUnit,
        baseQtyInSub: payload.baseQtyInSub,
      };
      await offlineDB.products.put(offlineProd);
      setPendingCount((c) => c + 1);
    }
    setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "10", qtyPerUnit: "50", subUnit: "kg" });
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
      stock: String(p.stock?? 10),
      qtyPerUnit: String(p.qtyPerUnit || (p.unit === "bag"? 50 : 1000)),
      subUnit: p.subUnit || (p.unit === "bag"? "kg" : "ml"),
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
    try { await fetch(`/api/products/${id}`, { method: "DELETE" }); }
    catch { await offlineDB.products.delete(id); }
    await refreshAfterAction(search);
  };

  const liveProfit = form.buyPrice && form.sellPrice? Number(form.sellPrice) - Number(form.buyPrice) : 0;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center font-medium">📶 Offline • {pendingCount} pending</div>}
      {pendingCount > 0 &&!isOffline && (
        <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl flex justify-between items-center">
          <span>{pendingCount} pending sync</span>
          <button onClick={() => syncPendingProducts()} disabled={syncing} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[11px] disabled:opacity-50">{syncing? "Syncing..." : "Sync Now"}</button>
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4">
        <h1 className="text-[20px] sm:text-2xl font-bold text-gray-800">🌾 Products - Flexible Sizes</h1>
        <input placeholder="🔍 Search..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="border border-gray-200 p-2.5 rounded-xl w-full sm:w-72 focus:ring-2 focus:ring-green-500 outline-none bg-white text-[14px] shadow-sm" />
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
        <p className="font-semibold mb-3 text-gray-700 text-[13px]">{editId? "Edit Product" : "Add New Product - 20kg/40kg/50kg bag | 500ml/1L/1.5L/2L bottle"}</p>

        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
          <input placeholder="Name e.g. Sona Urea / Spray X" value={form.name} onChange={(e) => setForm({...form, name: e.target.value })} className="border p-2.5 rounded-lg col-span-2 sm:col-span-4 text-[13px] focus:ring-2 focus:ring-green-500 outline-none" required />
          <input placeholder="Buy" type="number" step="0.01" value={form.buyPrice} onChange={(e) => setForm({...form, buyPrice: e.target.value })} className="border p-2.5 rounded-lg text-[13px] bg-red-50/50 outline-none" required />
          <input placeholder="Sell" type="number" step="0.01" value={form.sellPrice} onChange={(e) => setForm({...form, sellPrice: e.target.value })} className="border p-2.5 rounded-lg text-[13px] bg-blue-50/50 outline-none" required />

          <select value={form.unit} onChange={(e) => handleUnitChange(e.target.value)} className="border p-2.5 rounded-lg bg-white text-[13px] col-span-1 sm:col-span-2">
            <option value="bag">Bag (kg)</option>
            <option value="bottle">Bottle (ml/L)</option>
            <option value="kg">Kg loose</option>
            <option value="liter">Liter loose</option>
          </select>

          <input placeholder="Stock bags" type="number" step="0.01" value={form.stock} onChange={(e) => setForm({...form, stock: e.target.value })} className="border p-2.5 rounded-lg text-[13px] outline-none" />
        </div>

        {/* BAG SIZE SELECTOR */}
        {form.unit === "bag" && (
          <div className="mt-3 bg-green-50 p-3 rounded-xl border border-green-100">
            <p className="text-[11px] font-bold text-green-800 mb-2">Bag Size (Kg per bag):</p>
            <div className="flex flex-wrap gap-2">
              {BAG_SIZES.map((sz) => (
                <button key={sz} type="button" onClick={() => setForm({...form, qtyPerUnit: String(sz), subUnit: "kg" })} className={`px-3 py-1.5 rounded-full text-[12px] font-medium border ${Number(form.qtyPerUnit) === sz? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-200"}`}>{sz}kg</button>
              ))}
              <input type="number" placeholder="Custom kg" value={form.qtyPerUnit} onChange={(e) => setForm({...form, qtyPerUnit: e.target.value, subUnit: "kg" })} className="w-24 border p-1.5 rounded-full text-[12px] text-center" />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Price per kg will be auto: Rs.{form.sellPrice? (Number(form.sellPrice)/ (Number(form.qtyPerUnit)||50)).toFixed(1) : "0"}/kg</p>
          </div>
        )}

        {/* BOTTLE SIZE SELECTOR */}
        {form.unit === "bottle" && (
          <div className="mt-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
            <p className="text-[11px] font-bold text-blue-800 mb-2">Bottle Size:</p>
            <div className="flex flex-wrap gap-2">
              {BOTTLE_SIZES.map((b) => (
                <button key={b.label} type="button" onClick={() => setForm({...form, qtyPerUnit: String(b.qty), subUnit: b.sub })} className={`px-3 py-1.5 rounded-full text-[12px] font-medium border ${form.qtyPerUnit === String(b.qty) && form.subUnit === b.sub? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200"}`}>{b.label}</button>
              ))}
              <input type="number" placeholder="ml" value={form.subUnit === "ml"? form.qtyPerUnit : ""} onChange={(e) => setForm({...form, qtyPerUnit: e.target.value, subUnit: "ml" })} className="w-20 border p-1.5 rounded-full text-[12px] text-center" />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Price per 100ml: Rs.{form.sellPrice? ((Number(form.sellPrice)/ (Number(form.qtyPerUnit.includes(".")? Number(form.qtyPerUnit)*1000 : Number(form.qtyPerUnit)) || 1000))*100).toFixed(1) : "0"}</p>
          </div>
        )}

        {liveProfit!== 0 && <p className={`mt-2 text-[12px] font-medium ${liveProfit > 0? "text-green-600" : "text-red-600"}`}>Profit: Rs.{liveProfit} {form.buyPrice && Number(form.buyPrice) > 0? `(${Math.round((liveProfit / Number(form.buyPrice)) * 100)}%)` : ""} - Per {form.subUnit}: Rs.{(liveProfit / (Number(form.qtyPerUnit)||1)).toFixed(2)}</p>}

        <div className="flex gap-2 mt-3">
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-[13px] font-medium">{editId? "Update" : "+ Add Product"}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm({ name: "", buyPrice: "", sellPrice: "", unit: "bag", stock: "10", qtyPerUnit: "50", subUnit: "kg" }); }} className="bg-gray-100 px-6 py-2 rounded-lg text-[13px]">Cancel</button>}
        </div>
      </form>

      {loading? <p className="text-center text-gray-400 py-10 text-[13px]">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map((p) => {
              const sell = p.sellPrice || p.price;
              const buy = p.buyPrice || Math.round(sell * 0.75);
              const qty = p.qtyPerUnit || (p.unit === "bag"? 50 : 1000);
              const sub = p.subUnit || (p.unit === "bag"? "kg" : "ml");
              const displaySize = sub === "liter"? `${qty}L` : `${qty}${sub}`;
              return (
                <div key={p._id} className={`bg-white border p-3 rounded-xl shadow-sm ${p._id.startsWith("local_")? "bg-amber-50/60" : ""}`}>
                  <div className="flex justify-between">
                    <p className="font-semibold text-[13px]">{p.name}</p>
                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{displaySize}/{p.unit}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                    <div className="bg-red-50 p-1.5 rounded text-center"><div className="text-gray-500">Buy</div><div className="font-bold text-red-600">Rs.{buy}</div></div>
                    <div className="bg-blue-50 p-1.5 rounded text-center"><div className="text-gray-500">Sell</div><div className="font-bold text-blue-600">Rs.{sell}</div><div className="text-[8px]">{(sell/qty).toFixed(1)}/{sub}</div></div>
                    <div className="bg-green-50 p-1.5 rounded text-center"><div className="text-gray-500">Profit</div><div className="font-bold text-green-600">Rs.{sell-buy}</div></div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Stock: {Number(p.stock??0).toFixed(2)} {p.unit} {p.unit === "bag" || p.unit === "bottle"? `(${(Number(p.stock??0)*qty).toFixed(1)}${sub})` : ""}</p>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => handleEdit(p)} className="flex-1 bg-blue-50 text-blue-600 py-1.5 rounded-lg text-[11px]">Edit</button>
                    <button onClick={() => handleDelete(p._id)} className="flex-1 bg-red-50 text-red-600 py-1.5 rounded-lg text-[11px]">Del</button>
                  </div>
                </div>
              );
            })}
          </div>
          {pagination.hasMore && <button onClick={() => setPage((pr) => pr + 1)} disabled={loadingMore} className="w-full mt-4 py-2.5 bg-white border rounded-xl text-[13px]"> {loadingMore? "Loading..." : `More (${pagination.totalCount - products.length})`}</button>}
        </>
      )}
    </div>
  );
}
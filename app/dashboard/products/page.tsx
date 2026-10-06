"use client";
import { useEffect, useState } from "react";

type Product = { _id: string; name: string; price: number; unit: string; stock?: number };
type FormState = { name: string; price: string; unit: string; stock: string };
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>({ name: "", price: "", unit: "bag", stock: "100" });
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, hasMore: false, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&page=${page}&limit=20`, { signal: controller.signal });
        const data = (await res.json()) as { products: Product[]; pagination: Pagination } | Product[];
        if (Array.isArray(data)) {
          setProducts(data);
          setPagination({ page: 1, totalPages: 1, hasMore: false, totalCount: data.length });
        } else {
          if (page === 1) setProducts(data.products);
          else setProducts((prev) => [...prev,...data.products]);
          setPagination(data.pagination);
        }
      } catch (err) {
        if ((err as Error).name!== "AbortError") console.error(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [search, page]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const refreshAfterAction = async () => {
    setPage(1);
    const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&page=1&limit=20`);
    const data = (await res.json()) as { products: Product[]; pagination: Pagination } | Product[];
    if (Array.isArray(data)) setProducts(data);
    else {
      setProducts(data.products);
      setPagination(data.pagination);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: form.name, price: Number(form.price), unit: form.unit, stock: Number(form.stock) };
    const url = editId? `/api/products/${editId}` : "/api/products";
    const method = editId? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setForm({ name: "", price: "", unit: "bag", stock: "100" });
    setEditId(null);
    await refreshAfterAction();
  };

  const handleEdit = (p: Product) => {
    setEditId(p._id);
    setForm({ name: p.name, price: String(p.price), unit: p.unit, stock: String(p.stock?? 100) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    await refreshAfterAction();
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <h1 className="text-[20px] sm:text-2xl md:text-3xl font-bold text-gray-800">🌾 Products</h1>
        <input
          placeholder="🔍 Search products..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="border border-gray-200 p-2.5 sm:p-2.5 rounded-xl w-full sm:w-72 focus:ring-2 focus:ring-green-500 outline-none bg-white text-[14px] shadow-sm"
        />
      </div>

      {/* Add Form - Compact on mobile */}
      <form onSubmit={handleSubmit} className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100 mb-4 sm:mb-6">
        <p className="font-semibold mb-2 sm:mb-3 text-gray-700 text-[13px] sm:text-[15px]">{editId? "Edit Product" : "Add New Product"}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg col-span-2 text-[13px] sm:text-[14px] focus:ring-2 focus:ring-green-500 outline-none" required />
          <input placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg text-[13px] sm:text-[14px] focus:ring-2 focus:ring-green-500 outline-none" required />
          <select value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg bg-white text-[13px] sm:text-[14px]">
            <option value="bag">bag</option><option value="liter">liter</option><option value="kg">kg</option>
          </select>
          <input placeholder="Stock" type="number" value={form.stock} onChange={(e) => setForm({...form, stock: e.target.value })} className="border border-gray-200 p-2 sm:p-2.5 rounded-lg text-[13px] sm:text-[14px] focus:ring-2 focus:ring-green-500 outline-none col-span-2 sm:col-span-1" />
        </div>
        <div className="flex gap-2 mt-3">
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition text-[13px] sm:text-[14px]">{editId? "Update" : "+ Add"}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm({ name: "", price: "", unit: "bag", stock: "100" }); }} className="bg-gray-100 hover:bg-gray-200 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-[13px] sm:text-[14px]">Cancel</button>}
        </div>
      </form>

      {loading? <p className="text-center text-gray-400 py-10 text-[13px]">Loading...</p> : (
        <>
          {/* Grid: 2 cols on mobile, 3 on desktop - smaller cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {products.map((p) => (
              <div key={p._id} className="bg-white border border-gray-100 p-2.5 sm:p-4 rounded-xl shadow-sm hover:shadow-md transition flex flex-col">
                <div className="flex justify-between items-start gap-1 mb-1">
                  <p className="font-semibold text-gray-800 text-[12px] sm:text-[14px] leading-tight line-clamp-2">{p.name}</p>
                  {(p.stock?? 0) < 20 && <span className="text-[8px] sm:text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">Low</span>}
                </div>
                <p className="text-[11px] sm:text-[13px] text-gray-500 mt-0.5">Rs. <span className="font-bold text-gray-700">{p.price}</span>/{p.unit}</p>
                <p className="text-[10px] sm:text-[12px] text-gray-400">Stock: {p.stock?? 0}</p>
                <div className="flex gap-1.5 mt-2 sm:mt-3">
                  <button onClick={() => handleEdit(p)} className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">Edit</button>
                  <button onClick={() => handleDelete(p._id)} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-[13px] font-medium">Del</button>
                </div>
              </div>
            ))}
          </div>

          {pagination.hasMore && (
            <button onClick={() => setPage((pr) => pr + 1)} disabled={loadingMore} className="w-full mt-4 py-2.5 bg-white border border-gray-100 rounded-xl text-[13px] font-medium hover:bg-gray-50 disabled:opacity-50 shadow-sm">
              {loadingMore? "Loading..." : `More (${pagination.totalCount - products.length})`}
            </button>
          )}

          <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-4">{pagination.totalCount} total • {products.length} shown</p>
        </>
      )}
    </div>
  );
}
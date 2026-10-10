"use client";
import { useEffect, useState } from "react";

type Customer = {
  _id: string;
  saleId?: string;
  name: string;
  phone: string;
  village: string;
  totalUdhar: number;
  totalBusiness: number;
  lastUdharDate?: string;
  createdAt?: string;
  isPaid?: boolean;
  paidAmount?: number;
  paidAt?: string;
  updatedAt?: string;
};

type CustomerApi = Customer & { totalUdhar: number };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [wusoolId, setWusoolId] = useState<string | null>(null);
  const [wusoolName, setWusoolName] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [wusoolLoading, setWusoolLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAndSet = async (searchTerm: string) => {
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}`);
      const data = (await res.json()) as { customers?: CustomerApi[] };
      const list: Customer[] = (data.customers?? []).map((c) => ({
       ...c,
        totalUdhar: Math.round(c.totalUdhar || 0),
        totalBusiness: Math.round(c.totalBusiness || 0),
        paidAmount: Math.round(c.paidAmount || 0),
      }));
      const sorted = list.sort((a, b) => {
        if (a.isPaid!== b.isPaid) return a.isPaid? 1 : -1;
        return new Date(b.lastUdharDate || b.createdAt || 0).getTime() - new Date(a.lastUdharDate || a.createdAt || 0).getTime();
      });
      setCustomers(sorted);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) return;
      await fetchAndSet(search);
    };
    void load();
    return () => { active = false; };
  }, [search]);

  const reload = async () => { await fetchAndSet(search); };

  const handleWusool = async () => {
    if (!wusoolId ||!amount || wusoolLoading) return;
    setWusoolLoading(true);
    try {
      const res = await fetch("/api/khata/wusool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: wusoolId, amount: Math.round(Number(amount)) }),
      });
      if (!res.ok) throw new Error("Wusool failed");
      setWusoolId(null); setWusoolName(null); setAmount("");
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error? err.message : "Wusool failed";
      alert(msg);
      console.error(err);
    } finally {
      setWusoolLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this Khata entry permanently?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setCustomers((prev) => prev.filter((c) => c._id!== id));
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error? err.message : "Delete failed";
      alert(msg);
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const totalUdhar = Math.round(customers.filter((c) =>!c.isPaid).reduce((s, c) => s + c.totalUdhar, 0));
  const pendingCount = customers.filter((c) =>!c.isPaid).length;
  const paidCount = customers.filter((c) => c.isPaid).length;

  return (
    <div className="p-4">
      <div className="bg-white rounded-2xl p-4 mb-4 flex justify-between items-center shadow-sm border">
        <div>
          <h1 className="font-bold text-lg">Khata / Customers</h1>
          <p className="text-[11px] text-gray-500">{pendingCount} pending | {paidCount} Wusool Done</p>
        </div>
        <span className="font-bold text-red-600">Total Udhar: Rs {totalUdhar.toLocaleString()}</span>
      </div>

      <input
        placeholder="Search customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full p-3 rounded-xl border mb-4 bg-white outline-none focus:ring-2 focus:ring-green-600"
      />

      <div className="grid gap-3">
        {customers.length === 0? (
          <p className="text-center text-gray-400 py-8 bg-white rounded-xl border">No customers</p>
        ) : (
          customers.map((c) => {
            const udharDate = c.lastUdharDate || c.createdAt;
            const wusoolDate = c.paidAt || c.updatedAt;
            const isDeleting = deletingId === c._id;
            return (
            <div key={c._id} className={`bg-white p-4 rounded-xl flex justify-between items-center border shadow-sm ${c.isPaid? "bg-green-50/60 border-green-200" : ""}`}>
              <div className="flex-1">
                <p className="font-bold">
                  {c.name} <span className="text-[10px] text-gray-400">#{c._id.slice(-5)}</span>
                  {c.isPaid && <span className="ml-2 bg-green-600 text-white text-[10px] px-2.5 py-0.5 rounded-full">WUSOOL DONE</span>}
                </p>
                <div className="text-[11px] text-gray-500 leading-4 mt-1">
                  {c.isPaid? (
                    <>
                      <div>Udhar: {udharDate? new Date(udharDate).toLocaleString() : "-"}</div>
                      <div className="text-green-700 font-medium">Wusool: {wusoolDate? new Date(wusoolDate).toLocaleString() : "-"}</div>
                    </>
                  ) : (
                    <div>{udharDate? new Date(udharDate).toLocaleString() : ""} {c.village? `| ${c.village}` : ""} {c.phone? ` ${c.phone}` : ""}</div>
                  )}
                </div>
                {c.isPaid? (
                  <p className="text-sm mt-1">
                    <span className="text-green-700 font-bold">Wusool Done: Rs {c.paidAmount?.toLocaleString()}</span> <span className="text-gray-400">|</span> Business: Rs {c.totalBusiness.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm mt-1">
                    Udhar: <span className="text-red-600 font-bold">Rs {c.totalUdhar.toLocaleString()}</span> | Business: Rs {c.totalBusiness.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2 ml-2">
                {c.isPaid? (
                  <button onClick={() => handleDelete(c._id)} disabled={isDeleting} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${isDeleting? "bg-gray-100 text-gray-400" : "bg-gray-200 text-gray-700 hover:bg-red-500 hover:text-white"}`}>
                    {isDeleting? "..." : "Delete"}
                  </button>
                ) : (
                  <button onClick={() => { setWusoolId(c._id); setWusoolName(c.name); setAmount(String(c.totalUdhar)); }} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Wusool</button>
                )}
              </div>
            </div>
          )})
        )}
      </div>

      {wusoolId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="font-bold mb-3">Wusool from {wusoolName}</h2>
            <p className="text-[11px] text-gray-500 mb-2">ID: #{wusoolId.slice(-6)} - Exact row will be marked paid</p>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full p-3 border rounded-xl mb-3 outline-none focus:ring-2 focus:ring-green-600" />
            <div className="flex gap-2">
              <button onClick={() => { setWusoolId(null); setWusoolName(null); }} disabled={wusoolLoading} className="flex-1 p-3 bg-gray-100 rounded-xl disabled:opacity-50">Cancel</button>
              <button onClick={handleWusool} disabled={wusoolLoading} className="flex-1 p-3 bg-green-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:bg-green-400">
                {wusoolLoading? "Receiving..." : "Receive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
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
    } catch {}
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
    } finally {
      setDeletingId(null);
    }
  };

  const totalUdhar = Math.round(customers.filter((c) =>!c.isPaid).reduce((s, c) => s + c.totalUdhar, 0));
  const pendingCount = customers.filter((c) =>!c.isPaid).length;
  const paidCount = customers.filter((c) => c.isPaid).length;

  return (
    <div className="p-2 sm:p-3 md:p-4 max-w-2xl mx-auto">
      {/* Header - compact for mobile */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-2 sm:mb-3 flex justify-between items-center shadow-sm border">
        <div className="min-w-0">
          <h1 className="font-bold text-[14px] sm:text-[16px] leading-tight truncate">Khata / Customers</h1>
          <p className="text-[10px] sm:text-[11px] text-gray-500">{pendingCount} pending | {paidCount} Wusool</p>
        </div>
        <span className="font-bold text-red-600 text-[11px] sm:text-sm whitespace-nowrap ml-2">
          Rs {totalUdhar.toLocaleString()}
        </span>
      </div>

      <input
        placeholder="Search customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full p-2.5 sm:p-3 rounded-xl border mb-2 sm:mb-3 bg-white outline-none text-[13px] focus:ring-2 focus:ring-green-600"
      />

      <div className="grid gap-2 sm:gap-3">
        {customers.length === 0? (
          <p className="text-center text-gray-400 py-6 text-[12px] bg-white rounded-xl border">No customers</p>
        ) : (
          customers.map((c) => {
            const udharDate = c.lastUdharDate || c.createdAt;
            const wusoolDate = c.paidAt || c.updatedAt;
            const isDeleting = deletingId === c._id;
            return (
            <div key={c._id} className={`bg-white p-2.5 sm:p-3.5 rounded-xl flex justify-between items-start border shadow-sm ${c.isPaid? "bg-green-50/60 border-green-200" : ""}`}>
              <div className="flex-1 min-w-0 pr-2">
                <p className="font-bold text-[12px] sm:text-[13px] leading-tight flex items-center gap-1 flex-wrap">
                  <span className="truncate max-w-27.5 sm:max-w-none">{c.name}</span>
                  <span className="text-[9px] text-gray-400 font-normal">#{c._id.slice(-5)}</span>
                  {c.isPaid && <span className="bg-green-600 text-white text-[8px] px-2 py-0.5 rounded-full">WUSOOL</span>}
                </p>

                <div className="text-[10px] text-gray-500 leading-3 mt-1 truncate">
                  {c.isPaid? (
                    <>
                      <div className="truncate">Udhar: {udharDate? new Date(udharDate).toLocaleDateString() : "-"} {new Date(udharDate||0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                      <div className="text-green-700 font-medium truncate">Wusool: {wusoolDate? new Date(wusoolDate).toLocaleDateString() : "-"} {new Date(wusoolDate||0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </>
                  ) : (
                    <div className="truncate">{udharDate? new Date(udharDate).toLocaleString() : ""} {c.village? `| ${c.village}` : ""}</div>
                  )}
                </div>

                {c.isPaid? (
                  <p className="text-[11px] mt-1 truncate">
                    <span className="text-green-700 font-bold">Rs {c.paidAmount?.toLocaleString()}</span> <span className="text-gray-300">|</span> <span className="text-[10px]">B: Rs {c.totalBusiness.toLocaleString()}</span>
                  </p>
                ) : (
                  <p className="text-[11px] mt-1 truncate">
                    <span className="text-red-600 font-bold">Rs {c.totalUdhar.toLocaleString()}</span> <span className="text-gray-300">|</span> <span className="text-[10px]">B: Rs {c.totalBusiness.toLocaleString()}</span>
                  </p>
                )}
              </div>

              <div className="flex shrink-0">
                {c.isPaid? (
                  <button onClick={() => handleDelete(c._id)} disabled={isDeleting} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${isDeleting? "bg-gray-100 text-gray-400" : "bg-gray-100 text-gray-600 active:bg-red-500 active:text-white"}`}>
                    {isDeleting? "..." : "Del"}
                  </button>
                ) : (
                  <button onClick={() => { setWusoolId(c._id); setWusoolName(c.name); setAmount(String(c.totalUdhar)); }} className="bg-green-600 active:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold">
                    Wusool
                  </button>
                )}
              </div>
            </div>
          )})
        )}
      </div>

      {wusoolId && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-sm">
            <h2 className="font-bold text-[13px] mb-2">Wusool from {wusoolName}</h2>
            <p className="text-[10px] text-gray-500 mb-2">ID: #{wusoolId.slice(-6)}</p>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full p-2.5 border rounded-xl mb-3 outline-none text-[13px] focus:ring-2 focus:ring-green-600" />
            <div className="flex gap-2">
              <button onClick={() => { setWusoolId(null); setWusoolName(null); }} disabled={wusoolLoading} className="flex-1 p-2.5 bg-gray-100 rounded-xl text-[13px] disabled:opacity-50">Cancel</button>
              <button onClick={handleWusool} disabled={wusoolLoading} className="flex-1 p-2.5 bg-green-600 text-white rounded-xl font-bold text-[13px] disabled:opacity-50">
                {wusoolLoading? "..." : "Receive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#f6fef8] p-6 text-center">
      <Image src="/logo.png" alt="Al-Farooq" width={80} height={80} className="w-20 h-20 rounded-full border-2 border-green-700 mb-4" />
      <h1 className="text-xl font-bold">Al-Farooq Zarghi Shop</h1>
      <p className="text-green-700 text-sm font-medium">الفاروق زرعی سٹور</p>
      <p className="text-gray-500 text-[12px] mt-3">You are offline. Your data is safe.</p>
      <p className="text-[11px] text-gray-400 mt-1">Sales & Products work offline</p>
      <div className="flex gap-2 mt-5">
        <Link href="/" className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold">Home</Link>
        <Link href="/dashboard" className="bg-white border px-4 py-2 rounded-xl text-sm">Dashboard</Link>
      </div>
      <p className="text-[10px] text-gray-400 mt-6">0333-9426374 • Ismaila</p>
    </div>
  );
}
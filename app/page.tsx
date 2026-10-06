"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function HomePage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window!== "undefined") {
      return window.matchMedia("(display-mode: standalone)").matches;
    }
    return false;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert("Chrome Menu ⋮ → Add to Home screen / Install app");
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex justify-between items-center">
        <h1 className="font-bold text-[14px] sm:text-[16px]">🌾 Fertilizer Shop</h1>
        <div className="flex gap-2">
          {!isInstalled && (
            <button onClick={handleInstall} className="bg-green-600 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium">📲 Install</button>
          )}
          <Link href="/dashboard" className="bg-gray-100 px-3.5 py-1.5 rounded-lg text-[11px] font-medium">Dashboard →</Link>
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-8 max-w-6xl mx-auto w-full flex flex-col justify-center">
        <div className="text-center mb-5 sm:mb-8">
          <h1 className="text-[22px] sm:text-4xl font-bold leading-tight">Sona Fertilizer<br/>Management System</h1>
          <p className="text-gray-400 text-[12px] sm:text-[15px] mt-2">Fast billing • Stock tracking • Sales reports</p>

          {!isInstalled && (
            <div className="mt-4 bg-green-600 text-white p-3 sm:p-3.5 rounded-xl flex justify-between items-center text-left">
              <div>
                <p className="font-bold text-[12px]">📲 Install App</p>
                <p className="text-[10px] text-green-100">Works offline • Green 🌾 icon</p>
              </div>
              <button onClick={handleInstall} className="bg-white text-green-600 px-3.5 py-1.5 rounded-lg font-bold text-[11px] ml-2 shrink-0">Install</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-5">
          <Link href="/dashboard" className="bg-white border border-gray-100 p-3.5 sm:p-5 rounded-xl shadow-sm hover:shadow-md transition text-left">
            <p className="text-[16px]">📊</p>
            <p className="font-bold text-[13px] sm:text-[15px] mt-1">Dashboard</p>
            <p className="text-[11px] sm:text-[12px] text-gray-400 mt-1">Today sales, low stock, value</p>
            <span className="text-[11px] text-green-600 mt-2 inline-block">Open →</span>
          </Link>
          <Link href="/dashboard/sales" className="bg-white border border-gray-100 p-3.5 sm:p-5 rounded-xl shadow-sm hover:shadow-md transition text-left">
            <p className="text-[16px]">💰</p>
            <p className="font-bold text-[13px] sm:text-[15px] mt-1">Sales Point</p>
            <p className="text-[11px] sm:text-[12px] text-gray-400 mt-1">Quick sell with search</p>
            <span className="text-[11px] text-green-600 mt-2 inline-block">Sell →</span>
          </Link>
          <Link href="/dashboard/products" className="bg-white border border-gray-100 p-3.5 sm:p-5 rounded-xl shadow-sm hover:shadow-md transition text-left">
            <p className="text-[16px]">🌾</p>
            <p className="font-bold text-[13px] sm:text-[15px] mt-1">Products</p>
            <p className="text-[11px] sm:text-[12px] text-gray-400 mt-1">Add, edit, search, low stock</p>
            <span className="text-[11px] text-green-600 mt-2 inline-block">Manage →</span>
          </Link>
        </div>

        <div className="bg-green-600 text-white p-3.5 sm:p-5 rounded-xl flex justify-between items-center">
          <div>
            <p className="font-bold text-[13px] sm:text-[15px]">Ready to start?</p>
            <p className="text-[11px] sm:text-[12px] text-green-100 mt-0.5">Go to dashboard to manage shop</p>
          </div>
          <Link href="/dashboard" className="bg-white text-green-600 px-4 py-2 rounded-lg font-bold text-[12px] sm:text-[13px]">Start Selling</Link>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-5">localhost:3000 • Installable PWA • Made for mobile</p>
      </div>
    </div>
  );
}
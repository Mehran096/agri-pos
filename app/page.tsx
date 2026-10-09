"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function useIsStandalone(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const mql = window.matchMedia("(display-mode: standalone)");
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }, []);
  const getSnapshot = useCallback(() => window.matchMedia("(display-mode: standalone)").matches, []);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function HomePage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isStandalone = useIsStandalone();
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsInstalled(isStandalone);
  }, [isStandalone]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      window.alert("Chrome Menu ⋮ → Add to Home screen / Install app");
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  }, [deferredPrompt]);

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Al-Farooq" width={28} height={28} className="w-7 h-7 rounded-full border" />
          <h1 className="font-bold text-[14px] sm:text-[16px]">Al-Farooq Zarghi Shop</h1>
        </div>
        <div className="flex gap-2">
          {!isInstalled && (
            <button type="button" onClick={handleInstall} className="bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold">
              📲 Install
            </button>
          )}
          <Link href="/dashboard" className="bg-gray-900 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold">
            Dashboard →
          </Link>
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-8 max-w-6xl mx-auto w-full flex flex-col justify-center">
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <Image src="/logo.png" alt="Al-Farooq Zarghi" width={80} height={80} className="w-20 h-20 rounded-full border-2 border-green-700 shadow-sm" priority />
          </div>
          <h1 className="text-[22px] sm:text-4xl font-bold leading-tight">
            Al-Farooq Zarghi
            <br />
            <span className="text-green-700">Shop Management</span>
          </h1>
          <p className="text-gray-500 text-[12px] sm:text-[15px] mt-2 font-medium">الفاروق زرعی ادویات اینڈ بیج سٹور</p>
          <p className="text-gray-400 text-[11px] sm:text-[13px] mt-1">Fast billing • Stock tracking • Buy/Sell/Profit • Offline-ready</p>
          <p className="text-green-700 text-[11px] mt-2 font-bold">0333-9426374 | 0321-9801598 | 0345-9495414</p>

          {!isInstalled && (
            <div className="mt-4 bg-green-700 text-white p-3 rounded-xl flex justify-between items-center text-left max-w-sm mx-auto">
              <div>
                <p className="font-bold text-[12px]">📲 Install Al-Farooq App</p>
                <p className="text-[10px] text-green-100">Works offline • Fast sales</p>
              </div>
              <button type="button" onClick={handleInstall} className="bg-white text-green-700 px-3.5 py-1.5 rounded-lg font-bold text-[11px] ml-2 shrink-0">
                Install
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
          <Link href="/dashboard" className="bg-white border border-gray-100 p-3.5 rounded-[18px] shadow-sm hover:shadow-md transition">
            <p className="font-bold text-[13px] mt-1">📊 Dashboard</p>
            <p className="text-[11px] text-gray-400 mt-1">Today sales, Buy/Sell, low stock</p>
          </Link>
          <Link href="/dashboard/sales" className="bg-white border border-gray-100 p-3.5 rounded-[18px] shadow-sm hover:shadow-md transition">
            <p className="font-bold text-[13px] mt-1">💰 Sales Point</p>
            <p className="text-[11px] text-gray-400 mt-1">Quick sell with search</p>
          </Link>
          <Link href="/dashboard/products" className="bg-white border border-gray-100 p-3.5 rounded-[18px] shadow-sm hover:shadow-md transition">
            <p className="font-bold text-[13px] mt-1">🌾 Products</p>
            <p className="text-[11px] text-gray-400 mt-1">Add, edit, low stock</p>
          </Link>
        </div>
      </div>

      <div className="text-center pb-4 text-[10px] text-gray-400">
        Al-Farooq Zarghi Shop © {new Date().getFullYear()} • Ismaila, Swabi
      </div>
    </div>
  );
}
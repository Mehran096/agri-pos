"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Delete old crashing caches once
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        if (k.includes("agri-pwa") || k.includes("sona-shop-v")) {
          caches.delete(k);
        }
      });
    });

    // Register only after load, no auto-reload loop
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }, []);
  return null;
}
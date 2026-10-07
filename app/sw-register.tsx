"use client";
import { useEffect } from "react";

const CURRENT_CACHE = "sona-shop-v5-offline";

export default function SWRegister() {
 
  useEffect(() => {
    if (typeof window === "undefined" ||!("serviceWorker" in navigator)) return;

    // 1. ONE TIME FIX: Delete ALL old caches except current v5
    const cleanOldCaches = async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k!== CURRENT_CACHE && (k.includes("agri-pwa") || k.includes("sona-shop-")))
            .map((k) => caches.delete(k))
        );
      } catch {
        // ignore
      }
    };
    void cleanOldCaches();

    // 2. Register after load - prevents render blocking
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("SW v5 registered:", reg.scope);

          // 3. Auto-update when new SW found
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("New SW installed, will activate on next reload");
              }
            });
          });

          // 4. Force update check every hour (shop stays open long)
          window.setInterval(() => {
            void reg.update().catch(() => {});
          }, 60 * 60 * 1000);
        })
        .catch((err) => {
          console.error("SW register failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
    }

    return () => {
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
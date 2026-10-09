"use client";
import { useEffect } from "react";

const CURRENT_CACHE = "al-farooq-v4";

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const cleanOldCaches = async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k !== CURRENT_CACHE)
            .filter((k) => k.includes("agri-pwa") || k.includes("sona-shop-") || k.includes("al-farooq"))
            .map((k) => {
              console.log("Deleting old cache:", k);
              return caches.delete(k);
            })
        );
      } catch {}
    };
    void cleanOldCaches();

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("SW Al-Farooq v4 registered:", reg.scope);

          // Auto-reload when new SW takes over - fixes S logo instantly
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!refreshing) {
              refreshing = true;
              window.location.reload();
            }
          });

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("New Al-Farooq SW ready");
                // Optional: show toast "Update available - reloading"
                // newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          // Check for update every 1 hour + on focus (shop stays open)
          const checkUpdate = () => reg.update().catch(() => {});
          window.setInterval(checkUpdate, 60 * 60 * 1000);
          window.addEventListener("focus", checkUpdate);
        })
        .catch((err) => {
          console.error("SW register failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
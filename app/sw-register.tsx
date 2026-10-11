"use client";
import { useEffect } from "react";

const CURRENT_CACHE = "al-farooq-v5";

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
          console.log("SW Al-Farooq v5 registered:", reg.scope);

          let refreshing = false;
          const handleControllerChange = () => {
            if (!refreshing) {
              refreshing = true;
              window.location.reload();
            }
          };
          navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("New Al-Farooq SW ready");
              }
              // If new SW failed to install due to precache error, clean up
              if (newWorker.state === "redundant") {
                console.warn("New SW failed, cleaning old caches");
                void cleanOldCaches();
              }
            });
          });

          // Check for update every 1 hour + on focus
          const checkUpdate = () => reg.update().catch(() => {});
          const intervalId = window.setInterval(checkUpdate, 60 * 60 * 1000);
          window.addEventListener("focus", checkUpdate);

          return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", checkUpdate);
            navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
          };
        })
        .catch(async (err) => {
          console.error("SW register failed:", err);
          // This is your screenshot error: addAll failed -> unregister + clear cache
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.includes("al-farooq")).map((k) => caches.delete(k)));
            console.log("Cleared broken Al-Farooq SW, reload to retry");
          } catch {}
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
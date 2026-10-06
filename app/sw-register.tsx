"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // 1. Delete old crashing caches (agri-pwa-v1, sona-shop-v3, etc) - ONE TIME FIX
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        if (k.includes("agri-pwa") || k.includes("sona-shop-v")) {
          // Keep only v4
          if (k !== "sona-shop-v4-offline") {
            caches.delete(k);
          }
        }
      });
    });

    // 2. Unregister any old SW that is not v4 (fixes 2019 phone stuck SW)
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        // If old SW still active, update it
        reg.update().catch(()=>{});
      });
    });

    // 3. Register v4 safe offline SW after page load - no reload loop
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        console.log("SW v4 registered:", reg.scope);
      }).catch(() => {});
    });
  }, []);
  return null;
}
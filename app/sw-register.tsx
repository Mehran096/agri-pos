"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Clean old v1 cache that causes flash
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.includes("agri-pwa-v1") || key.includes("agri-pwa-v2")) {
              caches.delete(key);
            }
          });
        });
      }

      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            // Check for updates every hour
            setInterval(() => {
              reg.update();
            }, 3600000);

            reg.addEventListener("updatefound", () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    // New SW available, reload to get no-flash version
                    window.location.reload();
                  }
                });
              }
            });
          })
          .catch(() => {
            // silent fail in prod
          });
      });
    }
  }, []);
  return null;
}
"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/offline/service-worker";

/** Starts the service worker once the page is interactive. Renders nothing. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}

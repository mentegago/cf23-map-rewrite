import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { analytics } from "../data/analytics";
import { UpdatePrompt } from "./UpdatePrompt";
/** Native worker lifecycle, without Workbox-window's time-based update heuristics. */
export function Updates() {
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const requested = useRef(false);
  const shown = useRef(false);
  useEffect(() => {
    if (needRefresh && !shown.current) {
      shown.current = true;
      analytics.emit("update_action", { action: "shown" });
    }
  });
  const [needRefresh, setNeedRefresh] = useState(false),
    [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const abort = new AbortController();
    let disposed = false,
      reloading = false;
    const wasControlled = !!navigator.serviceWorker.controller;
    const changed = () => {
      if ((wasControlled || requested.current) && !reloading) {
        reloading = true;
        location.reload();
      } else setOfflineReady(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed, {
      signal: abort.signal,
    });
    const check = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void registration.current?.update().catch(() => {});
    };
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}flutter_service_worker.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((r) => {
        if (disposed) return;
        registration.current = r;
        if (r.waiting) setNeedRefresh(true);
        const observe = () => {
          const worker = r.installing;
          if (!worker) return;
          worker.addEventListener(
            "statechange",
            () => {
              if (worker.state === "installed") {
                if (navigator.serviceWorker.controller) setNeedRefresh(true);
                else setOfflineReady(true);
              }
            },
            { signal: abort.signal },
          );
        };
        r.addEventListener("updatefound", observe, { signal: abort.signal });
        observe();
      })
      .catch(() => {
        /* Offline boot still works with the existing active worker. */
      });
    const timer = setInterval(check, 60000);
    window.addEventListener("online", check, { signal: abort.signal });
    document.addEventListener("visibilitychange", check, {
      signal: abort.signal,
    });
    return () => {
      disposed = true;
      abort.abort();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 3000);
    return () => clearTimeout(timer);
  }, [offlineReady]);
  const update = () => {
    const waiting = registration.current?.waiting;
    if (!waiting) return;
    requested.current = true;
    analytics.emit("update_action", { action: "refresh" });
    void analytics
      .flushBeforeReload()
      .then(() => waiting.postMessage({ type: "SKIP_WAITING" }));
  };
  return needRefresh ? (
    <UpdatePrompt
      onUpdate={update}
      onDismiss={() => {
        setNeedRefresh(false);
        analytics.emit("update_action", { action: "dismissed" });
      }}
    />
  ) : offlineReady ? (
    <div className="update-banner" role="status">
      <span>Map ready for offline use</span>
      <button
        className="icon-button"
        aria-label="Dismiss offline notice"
        onClick={() => setOfflineReady(false)}
      >
        <X size={17} />
      </button>
    </div>
  ) : null;
}

import type { Catalog } from "../domain/search";
import { eventId } from "../domain/eventId";
import { APP_VERSION } from "../appVersion";

export type { Fields } from "./analyticsEvents";
import {
  AnalyticsLifecycle,
  captureOccurrence,
  type Fields,
  type Occurrence,
} from "./analyticsEvents";
interface EventRecord {
  id: string;
  created: number;
  event: { type: "event"; payload: Record<string, unknown> };
}
/** Compatible queue/lease layout. No query strings or arbitrary user text enter events. */
export class Analytics {
  private endpoint = import.meta.env.VITE_UMAMI_ENDPOINT as string | undefined;
  private website = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
  private hostname = import.meta.env.VITE_UMAMI_HOSTNAME as string | undefined;
  private enabled = !!(
    import.meta.env.PROD &&
    this.endpoint &&
    this.website &&
    this.hostname
  );
  private owner = eventId();
  private sequence = 0;
  private version?: number;
  private catalog: Catalog | null = null;
  private flushing?: Promise<void>;
  private flushRequested = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cache = "";
  private failures = 0;
  private memory = new Map<string, EventRecord>();
  private dbPromise: Promise<IDBDatabase> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private fallback = false;
  private notBefore = 0;
  private occurrence?: Occurrence;
  private lifecycle = new AnalyticsLifecycle(
    (name, fields) => this.record(name, fields),
    () => this.occurrence!.at,
    () => this.occurrence!.visible,
  );
  constructor() {
    if (!this.enabled) return;
    try {
      const endpoint = new URL(this.endpoint!);
      this.enabled = ["https:", "http:"].includes(endpoint.protocol);
    } catch {
      this.enabled = false;
    }
    if (!this.enabled) return;
    window.addEventListener("online", () => {
      this.notBefore = 0;
      void this.flush().catch(() => {});
    });
    this.queue({
      id: `page-${this.owner}-${Date.now()}`,
      created: Date.now(),
      event: { type: "event", payload: { url: "/", title: "CF23 Booth Map" } },
    });
  }
  configure(catalog: Catalog, version: number) {
    this.catalog = catalog;
    this.version = version;
    if (this.enabled) {
      void this.flush().catch(() => {});
    }
  }
  emit<K extends keyof Fields>(
    name: K,
    fields: Fields[K],
    occurrence = captureOccurrence(),
  ) {
    this.occurrence = occurrence;
    if (this.enabled) this.lifecycle.emit(name, fields);
  }
  activity(occurrence = captureOccurrence()) {
    this.occurrence = occurrence;
    if (this.enabled) this.lifecycle.activity();
  }
  async flushBeforeReload() {
    await this.writes;
    await this.flush();
  }
  private record<K extends keyof Fields>(name: K, fields: Fields[K]) {
    if (!this.enabled) return;
    const id = eventId(),
      now = this.occurrence!.at;
    const typed = fields as Record<string, unknown>;
    const creator =
      typeof typed.creator_id === "number"
        ? this.catalog?.byId.get(typed.creator_id)
        : undefined;
    const fandom =
      typeof typed.fandom_id === "number"
        ? this.catalog?.fandoms.get(typed.fandom_id)
        : undefined;
    const event: EventRecord = {
      id,
      created: Date.now(),
      event: {
        type: "event",
        payload: {
          url: "/",
          name,
          data: {
            schema_version: 3,
            event_edition: "comic-frontier-23",
            app_version: APP_VERSION,
            ...(this.version === undefined
              ? {}
              : { catalog_version: this.version }),
            client_event_id: id,
            occurred_at_ms: now,
            app_run_id: this.owner,
            sequence: ++this.sequence,
            ...fields,
            ...(creator?.name
              ? { creator_name: displayName(creator.name) }
              : {}),
            ...(fandom?.name ? { fandom_name: displayName(fandom.name) } : {}),
          },
        },
      },
    };
    this.queue(event);
  }
  private queue(event: EventRecord) {
    this.writes = this.writes.then(() => this.put(event)).catch(() => {});
    void this.writes.then(() => {
      void this.flush().catch(() => {});
    });
  }
  private db() {
    if (this.fallback) return Promise.reject(Error("Memory-only analytics"));
    return (this.dbPromise ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("cf23-analytics", 1);
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        reject(Error("Analytics storage timed out"));
      }, 1000);
      r.onupgradeneeded = () => {
        try {
          if (!r.result.objectStoreNames.contains("events"))
            r.result.createObjectStore("events", { keyPath: "id" });
          if (!r.result.objectStoreNames.contains("leases"))
            r.result.createObjectStore("leases");
        } catch (error) {
          reject(error);
        }
      };
      r.onsuccess = () => {
        clearTimeout(timeout);
        if (settled) {
          r.result.close();
          return;
        }
        settled = true;
        resolve(r.result);
      };
      r.onerror = () => {
        clearTimeout(timeout);
        settled = true;
        reject(r.error);
      };
      r.onblocked = () => {
        clearTimeout(timeout);
        settled = true;
        reject(Error("Analytics database blocked"));
      };
    }));
  }
  private async put(record: EventRecord) {
    try {
      const db = await this.db();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        const store = tx.objectStore("events");
        store.put(record);
        const all = store.getAll();
        all.onsuccess = () => {
          const records = (all.result as EventRecord[]).sort(recordOrder);
          records.forEach((r, i) => {
            if (Date.now() - r.created > 259200000 || i < records.length - 2000)
              store.delete(r.id);
          });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      this.fallback = true;
      this.memory.set(record.id, record);
      while (this.memory.size > 2000)
        this.memory.delete(this.memory.keys().next().value!);
    }
  }
  private async pending() {
    try {
      const db = await this.db();
      return await new Promise<EventRecord[]>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite"),
          store = tx.objectStore("events"),
          r = store.getAll();
        let result: EventRecord[] = [];
        r.onsuccess = () => {
          try {
            const all = (r.result as EventRecord[]).sort(recordOrder);
            result = all.filter((v, i) => {
              const keep =
                Date.now() - v.created <= 259200000 && i >= all.length - 2000;
              if (!keep) store.delete(v.id);
              return keep;
            });
          } catch (error) {
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      return [...this.memory.values()]
        .filter((r) => Date.now() - r.created <= 259200000)
        .sort(recordOrder);
    }
  }
  private async lease(release = false) {
    try {
      const db = await this.db();
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction("leases", "readwrite"),
          store = tx.objectStore("leases"),
          r = store.get("sender");
        let allowed = false;
        r.onsuccess = () => {
          try {
            const lease = r.result;
            allowed =
              !lease || lease.owner === this.owner || lease.until <= Date.now();
            if (release) {
              if (lease?.owner === this.owner) store.delete("sender");
            } else if (allowed)
              store.put(
                { owner: this.owner, until: Date.now() + 15000 },
                "sender",
              );
          } catch (error) {
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(allowed);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      return true;
    }
  }
  private async remove(id: string) {
    this.memory.delete(id);
    try {
      const db = await this.db();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        tx.objectStore("events").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      /* Memory-only storage remains usable. */
    }
  }
  private flush(): Promise<void> {
    if (this.flushing) {
      this.flushRequested = true;
      return this.flushing;
    }
    this.flushRequested = false;
    this.flushing = this.drain().finally(() => {
      this.flushing = undefined;
      if (this.flushRequested) void this.flush().catch(() => {});
    });
    return this.flushing;
  }
  private async drain() {
    if (!this.enabled || !navigator.onLine) return;
    if (Date.now() < this.notBefore) return;
    let leaseContended = false;
    clearTimeout(this.timer);
    try {
      if (!(await this.lease())) {
        leaseContended = true;
        return;
      }
      while (true) {
        await this.writes;
        const record = (await this.pending())[0];
        if (!record) break;
        if (!(await this.lease())) {
          leaseContended = true;
          return;
        }
        const response = await fetch(this.endpoint!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.cache ? { "x-umami-cache": this.cache } : {}),
          },
          body: JSON.stringify({
            ...record.event,
            payload: {
              website: this.website,
              hostname: this.hostname,
              referrer: "",
              language: navigator.language,
              screen: `${screen.width}x${screen.height}`,
              ...record.event.payload,
            },
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (response.status === 429 || response.status >= 500)
          throw Error("Retry later");
        if (
          (response.status === 401 || response.status === 403) &&
          this.cache
        ) {
          this.cache = "";
          throw Error("Refresh session");
        }
        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (typeof data?.cache === "string") this.cache = data.cache;
        }
        await this.remove(record.id);
        this.failures = 0;
        this.notBefore = 0;
      }
      this.failures = 0;
    } catch {
      const seconds = Math.min(60, 2 ** Math.min(this.failures++, 6));
      this.notBefore =
        Date.now() +
        Math.min(
          60000,
          Math.round(seconds * 1000 * (0.75 + Math.random() * 0.5)),
        );
    } finally {
      await this.lease(true);
      if (leaseContended || this.notBefore > Date.now())
        this.timer = setTimeout(
          () => void this.flush().catch(() => {}),
          this.notBefore > Date.now() ? this.notBefore - Date.now() : 5000,
        );
    }
  }
}

export function displayName(name: string) {
  if (name.length <= 500) return name;
  const last = name.charCodeAt(499);
  return name.slice(0, last >= 0xd800 && last <= 0xdbff ? 499 : 500);
}
export function recordOrder(a: EventRecord, b: EventRecord) {
  const ad = a.event.payload.data as
    { app_run_id?: string; sequence?: number } | undefined;
  const bd = b.event.payload.data as typeof ad;
  return (
    a.created - b.created ||
    Number(!!ad) - Number(!!bd) ||
    (ad?.app_run_id || "").localeCompare(bd?.app_run_id || "") ||
    (ad?.sequence ?? 0) - (bd?.sequence ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

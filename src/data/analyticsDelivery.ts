import type { Catalog } from "../domain/search";
import { eventId } from "../domain/eventId";

export type Fields = {
  app_ready: { duration_ms: number; source: "bundled" | "cache" };
  creator_opened: {
    creator_id: number;
    source:
      | "map"
      | "list"
      | "search_result"
      | "recommendation"
      | "random"
      | "deeplink";
  };
  creator_closed: {
    creator_id: number;
    reason: "dismissed" | "replaced" | "search_opened";
  };
  bookmark_changed: {
    creator_id: number;
    action: "add" | "remove";
    source: "individual" | "bulk";
  };
  creator_action: {
    creator_id: number;
    action: "external_link" | "share";
    success: boolean;
  };
  gallery_action: {
    creator_id: number;
    action: "open" | "close" | "image_changed";
    index?: number;
    count?: number;
  };
  booth_selected: { count: number; outcome: "empty" | "opened" | "chooser" };
  list_scope_changed: {
    scope: "full_catalog" | "shared_list" | "search_result_list";
    count: number;
  };
  search_performed: {
    source: "typed" | "suggestion";
    trigger: "settled";
    resolution: "explicit_selection" | "unresolved";
    fandom_id?: number;
    result_count: number;
    catalog_result_count: number;
    scope: "full_catalog" | "shared_list";
  };
  map_interacted: { action: "pan" | "zoom" | "both" };
  sheet_state_changed: {
    state: "collapsed" | "partiallyExpanded" | "expanded";
    sheet: "search" | "detail";
    source: "gesture" | "programmatic";
  };
  active_minute: Record<string, never>;
};
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
  private version = 0;
  private catalog: Catalog | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cache = "";
  private failures = 0;
  private memory = new Map<string, EventRecord>();
  private dbPromise: Promise<IDBDatabase> | undefined;
  configure(catalog: Catalog, version: number) {
    this.catalog = catalog;
    this.version = version;
    if (this.enabled) {
      window.addEventListener(
        "online",
        () => void this.flush().catch(() => {}),
        {
          once: true,
        },
      );
      void this.flush().catch(() => {});
    }
  }
  emit<K extends keyof Fields>(name: K, fields: Fields[K]) {
    if (!this.enabled) return;
    const id = eventId(),
      now = Date.now();
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
      created: now,
      event: {
        type: "event",
        payload: {
          url: "/",
          name,
          data: {
            schema_version: 1,
            event_edition: "comic-frontier-23",
            app_version: "web-1",
            catalog_version: this.version,
            client_event_id: id,
            occurred_at_ms: now,
            app_run_id: this.owner,
            sequence: ++this.sequence,
            ...fields,
            ...(name === "search_performed" ? { search_id: id } : {}),
            ...(creator ? { creator_name: creator.name } : {}),
            ...(fandom ? { fandom_name: fandom.name } : {}),
          },
        },
      },
    };
    return this.put(event).then(() => {
      void this.flush().catch(() => {});
    });
  }
  private db() {
    return (this.dbPromise ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("cf23-analytics", 1);
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
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(Error("Analytics database blocked"));
    }));
  }
  private async put(record: EventRecord) {
    try {
      const db = await this.db();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        tx.objectStore("events").put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
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
            const all = (r.result as EventRecord[]).sort(
              (a, b) => a.created - b.created || a.id.localeCompare(b.id),
            );
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
      return [...this.memory.values()].filter(
        (r) => Date.now() - r.created < 259200000,
      );
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
  private async flush() {
    if (!this.enabled || this.busy || !navigator.onLine) return;
    this.busy = true;
    clearTimeout(this.timer);
    try {
      if (!(await this.lease())) return;
      for (const record of await this.pending()) {
        if (!(await this.lease())) return;
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
      }
      this.failures = 0;
    } catch {
      this.failures++;
    } finally {
      await this.lease(true);
      this.busy = false;
      this.timer = setTimeout(
        () => void this.flush().catch(() => {}),
        Math.min(60000, 5000 * 2 ** Math.min(this.failures, 4)),
      );
    }
  }
}

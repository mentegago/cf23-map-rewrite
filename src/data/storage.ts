export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function loadFavorites(): Set<number> {
  const raw = readLocal<unknown>("flutter.favorite_creator_ids", []);
  return new Set(
    Array.isArray(raw)
      ? raw.map(Number).filter((id) => Number.isSafeInteger(id) && id >= 0)
      : [],
  );
}
export function saveFavorites(ids: Set<number>) {
  return writeLocal("flutter.favorite_creator_ids", [...ids].map(String));
}
// Use the original database, store, keys, and JSON-string record values directly.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("cf23-map", 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("catalog"))
        r.result.createObjectStore("catalog");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("Database blocked"));
  });
}
export async function readSnapshot(
  key: "snapshot_v3" | "map_v1",
): Promise<unknown> {
  try {
    const db = await database();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("catalog");
      const r = tx.objectStore("catalog").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      tx.oncomplete = () => db.close();
    });
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {
    // An unavailable or corrupt cache falls back to bundled app data.
  }
  return null;
}
export async function cacheSnapshot(value: import("../domain/types").Snapshot) {
  const catalog = JSON.stringify({
    version: value.version,
    catalog: value.catalog,
    fandomRegistry: value.registry,
  });
  const map = JSON.stringify({
    version: value.mapVersion,
    layout: value.map,
    proximity: value.proximity,
  });
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("catalog", "readwrite");
      tx.objectStore("catalog").put(catalog, "snapshot_v3");
      tx.objectStore("catalog").put(map, "map_v1");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Keep the refreshed data in memory; do not recreate obsolete preferences caches.
  }
}

import type { Snapshot } from "../domain/types";
import { readSnapshot, cacheSnapshot } from "./storage";
const BASE = "https://cf23-config.nnt.gg/";
async function json(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: "no-cache",
  });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}
export function validSnapshot(value: unknown): value is Snapshot {
  try {
    const s = value as Snapshot;
    if (
      !s ||
      !Number.isInteger(s.version) ||
      !Number.isInteger(s.mapVersion) ||
      !s.catalog.schemaVersion.startsWith("1.") ||
      !s.registry.schemaVersion.startsWith("1.") ||
      !s.catalog.exhibitors.length ||
      !Array.isArray(s.registry.fandoms)
    )
      return false;
    if (
      s.map.schemaVersion !== 2 ||
      !(s.map.bounds.width > 0) ||
      !(s.map.bounds.height > 0) ||
      !s.map.features.length ||
      !Number.isFinite(s.map.bounds.width + s.map.bounds.height)
    )
      return false;
    if (
      !s.map.features.every(
        (f) =>
          f.geometry &&
          [
            f.geometry.x,
            f.geometry.y,
            f.geometry.width,
            f.geometry.height,
            f.rotation ?? 0,
            f.thickness ?? 1,
            f.fontSize ?? 1,
            f.lineStart?.x ?? 0,
            f.lineStart?.y ?? 0,
            f.lineEnd?.x ?? 0,
            f.lineEnd?.y ?? 0,
          ].every(Number.isFinite) &&
          f.geometry.width >= 0 &&
          f.geometry.height >= 0,
      )
    )
      return false;
    if (
      s.proximity.schema_version !== 1 ||
      s.proximity.booths.length !== s.proximity.neighbors.length ||
      !s.proximity.neighbors.every((row) =>
        row.every(
          ([id, d]) =>
            Number.isInteger(id) &&
            id >= 0 &&
            id < s.proximity.booths.length &&
            Number.isFinite(d) &&
            d >= 0,
        ),
      )
    )
      return false;
    return s.catalog.exhibitors.every(
      (c) =>
        Number.isSafeInteger(Number(c.id)) &&
        typeof c.name === "string" &&
        Array.isArray(c.spaces) &&
        Array.isArray(c.fandomIds) &&
        Array.isArray(c.attendanceDates) &&
        (c.links == null || Array.isArray(c.links)) &&
        (c.assets?.gallery == null || Array.isArray(c.assets.gallery)),
    );
  } catch {
    return false;
  }
}
export async function loadSnapshot(): Promise<Snapshot> {
  const names = [
    "catalog-initial",
    "fandoms-initial",
    "map",
    "booth-proximity",
    "last-updated-initial",
    "map-version",
  ];
  const [catalog, registry, map, proximity, version, mapVersion] =
    await Promise.all(names.map((name) => json(`/data/${name}.json`)));
  const bundled = {
    version: version.creator_data_version,
    catalog,
    registry,
    mapVersion: mapVersion.version,
    map,
    proximity,
  };
  if (!validSnapshot(bundled)) throw Error("The bundled data is invalid.");
  const [catalogCache, mapCache] = await Promise.all([
    readSnapshot("snapshot_v3"),
    readSnapshot("map_v1"),
  ]);
  let result = bundled;
  // Each current record has its own version; one may be newer than the other.
  if (
    catalogCache &&
    typeof catalogCache === "object" &&
    "version" in catalogCache &&
    "catalog" in catalogCache &&
    "fandomRegistry" in catalogCache
  ) {
    const candidate = {
      ...result,
      version: catalogCache.version,
      catalog: catalogCache.catalog,
      registry: catalogCache.fandomRegistry,
    };
    if (validSnapshot(candidate) && candidate.version >= result.version)
      result = candidate;
  }
  if (
    mapCache &&
    typeof mapCache === "object" &&
    "version" in mapCache &&
    "layout" in mapCache &&
    "proximity" in mapCache
  ) {
    const candidate = {
      ...result,
      mapVersion: mapCache.version,
      map: mapCache.layout,
      proximity: mapCache.proximity,
    };
    if (validSnapshot(candidate) && candidate.mapVersion >= result.mapVersion)
      result = candidate;
  }
  return result;
}
function configURL(path: string) {
  const u = new URL(path, BASE);
  if (u.origin !== new URL(BASE).origin) throw Error("Unexpected data origin");
  return u.href;
}
/** Fetch and validate the entire replacement before switching any visible data. */
export async function refreshSnapshot(
  current: Snapshot,
): Promise<Snapshot | null> {
  const manifest = await json(BASE + "manifest.json");
  if (!String(manifest.schemaVersion).startsWith("1."))
    throw Error("Unsupported manifest");
  const versions = await json(BASE + "last-updated.json");
  const version = Number(versions.creator_data_version),
    mapVersion = Number(manifest.map?.version || current.mapVersion);
  if (version <= current.version && mapVersion <= current.mapVersion)
    return null;
  const next = { ...current };
  if (version > current.version) {
    const [catalog, registry] = await Promise.all([
      json(configURL(manifest.catalog)),
      json(configURL(manifest.fandomRegistry)),
    ]);
    Object.assign(next, { catalog, registry, version });
  }
  if (mapVersion > current.mapVersion) {
    const map = await json(configURL(manifest.map.path));
    if (map.version !== mapVersion) throw Error("Mismatched map version");
    Object.assign(next, {
      mapVersion,
      map: map.layout,
      proximity: map.proximity,
    });
  }
  if (!validSnapshot(next)) throw Error("Invalid update");
  await cacheSnapshot(next);
  return next;
}

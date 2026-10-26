export interface Collection {
  id: string;
  name: string;
  ids: number[];
}

const key = "cf23.collections.v1";
export function mergeCreatorIds(existing: number[], incoming: number[]) {
  return [...new Set([...existing, ...incoming])];
}
export function loadCollections(): Collection[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (c): c is Collection =>
          c &&
          typeof c.id === "string" &&
          typeof c.name === "string" &&
          c.name.trim().length > 0 &&
          Array.isArray(c.ids) &&
          c.ids.every(
            (id: unknown) =>
              typeof id === "number" && Number.isSafeInteger(id) && id > 0,
          ),
      )
      .map((c) => ({ ...c, ids: mergeCreatorIds([], c.ids) }));
  } catch {
    return [];
  }
}
export function saveCollections(collections: Collection[]) {
  try {
    localStorage.setItem(key, JSON.stringify(collections));
    return true;
  } catch {
    return false;
  }
}

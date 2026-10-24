/** Wire compatible with Flutter IntEncoding (sorted delta varints, URL-safe base64). */
export function encodeList(ids: Iterable<number>): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const bytes: number[] = [];
  let last = 0;
  for (const id of sorted) {
    if (!Number.isSafeInteger(id) || id < 0) throw Error("Invalid ID");
    let n = id - last;
    last = id;
    while (n >= 128) {
      bytes.push((n % 128) + 128);
      n = Math.floor(n / 128);
    }
    bytes.push(n);
  }
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeList(code: string): number[] {
  try {
    if (!/^[\w-]*$/.test(code) || code.length > 50000) return [];
    const bytes = atob(code.replaceAll("-", "+").replaceAll("_", "/"));
    let n = 0,
      mult = 1,
      last = 0;
    const ids: number[] = [];
    for (const ch of bytes) {
      const b = ch.charCodeAt(0);
      n += (b & 127) * mult;
      if (!Number.isSafeInteger(n)) return [];
      if (b & 128) {
        mult *= 128;
        if (mult > 2 ** 49) return [];
      } else {
        last += n;
        if (!Number.isSafeInteger(last)) return [];
        ids.push(last);
        n = 0;
        mult = 1;
      }
    }
    return mult === 1 ? ids : [];
  } catch {
    return [];
  }
}
export type DeepLink =
  | { kind: "list"; ids: number[] }
  | { kind: "creator"; id: number }
  | { kind: "fandom"; id: number }
  | { kind: "name"; name: string }
  | { kind: "invalid" }
  | null;
export function parseLink(input: string): DeepLink {
  try {
    const p = new URL(input, "https://cf23-map.nnt.gg").searchParams;
    if (p.has("list") || p.has("custom_list")) {
      const ids = p.has("list")
        ? decodeList(p.get("list")!)
        : p.get("custom_list")!.split(",").map(Number);
      return ids.length && ids.every((n) => Number.isSafeInteger(n) && n >= 0)
        ? { kind: "list", ids: [...new Set(ids)] }
        : { kind: "invalid" };
    }
    if (p.has("creator_id")) {
      const id = Number(p.get("creator_id"));
      return p.get("creator_id") && Number.isSafeInteger(id) && id >= 0
        ? { kind: "creator", id }
        : { kind: "invalid" };
    }
    if (p.has("creator"))
      return p.get("creator")!.trim()
        ? { kind: "name", name: p.get("creator")!.trim() }
        : { kind: "invalid" };
    if (p.has("fandom")) {
      const value = p.get("fandom")!;
      const id = Number(value);
      return /^\d+$/.test(value) && Number.isSafeInteger(id)
        ? { kind: "fandom", id }
        : { kind: "invalid" };
    }
    return null;
  } catch {
    return null;
  }
}
export function shareURL(
  kind: "creator_id" | "list" | "fandom",
  value: string | number,
) {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set(kind, String(value));
  return u.href;
}
export function safeURL(value?: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {
    /* malformed source URL */
  }
}

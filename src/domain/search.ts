import type {
  CatalogDocument,
  Creator,
  Fandom,
  RegistryDocument,
} from "./types";
export const compareNames = (a: string, b: string) =>
  a.toLowerCase() < b.toLowerCase()
    ? -1
    : a.toLowerCase() > b.toLowerCase()
      ? 1
      : 0;
export const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const boothKey = (s: string) => normalize(s).replace(/([a-z])0+/g, "$1");
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) || [];
const sep = (s: string) => /[\/\\_\- .:\t]/.test(s);
/** Port of the original separator-aware subsequence score. */
export function fuzzyScore(query: string, target: string) {
  if (!query) return 1;
  let cursor = 0,
    raw = 0,
    prev = -1;
  const lower = target.toLowerCase();
  const boundary = (i: number) =>
    i === 0 ||
    sep(target[i - 1]) ||
    (/[a-z]/.test(target[i - 1]) && /[A-Z]/.test(target[i])) ||
    /[a-z]/i.test(target[i - 1]) !== /[a-z]/i.test(target[i]);
  for (let i = 0; i < query.length; i++) {
    const p = lower.indexOf(query[i].toLowerCase(), cursor);
    if (p < 0) return 0;
    let s =
      1 +
      (target[p] === query[i]?.toLowerCase() ? 0.05 : 0) +
      (boundary(p) ? 0.7 : 0);
    if (prev >= 0) {
      const gap = [...target.slice(prev + 1, p)].filter((c) => !sep(c)).length;
      s += gap === 0 ? 0.8 : -0.08 * gap;
      if (boundary(prev) && boundary(p)) s += 0.4;
    }
    if (i === 0 && p === 0) s += 0.8;
    raw += s;
    prev = p;
    cursor = p + 1;
  }
  return Math.max(
    0,
    Math.min(1, raw / (query.length * 1.05 + 1.5 + (query.length - 1) * 0.8)),
  );
}
type Score = {
  tier: number;
  score: number;
  coverage: number;
  canonical: boolean;
};
const compare = (a: Score, b: Score) =>
  a.tier - b.tier ||
  Number(b.canonical) - Number(a.canonical) ||
  b.score - a.score ||
  b.coverage - a.coverage;
function labelScore(
  query: string,
  label: string,
  canonical: boolean,
): Score | null {
  const q = normalize(query),
    t = normalize(label);
  if (!q || !t) return null;
  const coverage = q.length / t.length;
  if (q === t) return { tier: 0, score: 1, coverage, canonical };
  const qw = words(query),
    tw = words(label);
  if (
    t.startsWith(q) ||
    tw.some(
      (_, start) =>
        qw.length > 0 && qw.every((w, i) => tw[start + i]?.startsWith(w)),
    )
  )
    return { tier: 1, score: 1, coverage, canonical };
  if (
    q.length >= 2 &&
    tw
      .map((w) => w[0])
      .join("")
      .startsWith(q)
  )
    return { tier: 2, score: 0.85, coverage, canonical };
  const score = q.length > 3 ? fuzzyScore(q, label.toLowerCase()) : 0;
  return score >= 0.7 ? { tier: 3, score, coverage, canonical } : null;
}
export class Catalog {
  readonly creators: Creator[];
  readonly byId = new Map<number, Creator>();
  readonly fandoms = new Map<number, Fandom>();
  readonly byBooth = new Map<string, Creator[]>();
  readonly byFandom = new Map<number, Set<Creator>>();
  readonly popular: Fandom[];
  private cache = new Map<string, Creator[]>();
  constructor(document: CatalogDocument, registry: RegistryDocument) {
    for (const f of registry.fandoms) this.fandoms.set(f.id, f);
    this.creators = document.exhibitors
      .map((c) => ({
        ...c,
        id: Number(c.id),
        spaces: c.spaces || [],
        attendanceDates: c.attendanceDates || [],
        offerings: c.offerings || [],
        links: c.links || [],
        assets: {
          thumbnail: c.assets?.thumbnail,
          gallery: c.assets?.gallery || [],
        },
        fandomIds: c.fandomIds || [],
        catalogUrl:
          c.catalogUrl === undefined
            ? `https://catalog.comifuro.net/circle/${c.id}`
            : c.catalogUrl,
        fandoms: (c.fandomIds || [])
          .map((id) => this.fandoms.get(id))
          .filter((f): f is Fandom => !!f)
          .sort((a, b) => compareNames(a.name, b.name)),
        booths: (c.spaces || []).map((s) => s.code),
        day: (c.attendanceDates || [])
          .map((d) => {
            const label =
              document.event.days.find((day) => day.id === d)?.label || d;
            return /saturday|sabtu/i.test(label)
              ? "Sat"
              : /sunday|minggu/i.test(label)
                ? "Sun"
                : label;
          })
          .join(" & "),
      }))
      .sort((a, b) => compareNames(a.name, b.name));
    for (const c of this.creators) {
      this.byId.set(c.id, c);
      for (const b of c.booths) {
        const k = boothKey(b);
        this.byBooth.set(k, [...(this.byBooth.get(k) || []), c]);
      }
      for (const f of c.fandoms) {
        for (const id of this.ancestors(f.id).keys()) {
          if (!this.byFandom.has(id)) this.byFandom.set(id, new Set());
          this.byFandom.get(id)!.add(c);
        }
      }
    }
    this.popular = [...this.fandoms.values()]
      .filter((f) => this.byFandom.has(f.id))
      .sort(
        (a, b) =>
          this.byFandom.get(b.id)!.size - this.byFandom.get(a.id)!.size ||
          compareNames(a.name, b.name),
      );
  }
  ancestors(id: number) {
    const result = new Map<number, number>();
    for (let d = 0; d < 8 && !result.has(id); d++) {
      result.set(id, d);
      const parent = this.fandoms.get(id)?.parentId;
      if (parent == null) break;
      id = parent;
    }
    return result;
  }
  fandomMatches(query: string) {
    const result: { fandom: Fandom; score: Score }[] = [];
    for (const f of this.fandoms.values()) {
      if (!this.byFandom.has(f.id)) continue;
      const scores = [f.name, ...(f.alternateNames || [])]
        .map((s, i) => labelScore(query, s, i === 0))
        .filter((s): s is Score => !!s)
        .sort(compare);
      if (scores[0]) result.push({ fandom: f, score: scores[0] });
    }
    return result.sort(
      (a, b) =>
        compare(a.score, b.score) || a.fandom.name.localeCompare(b.fandom.name),
    );
  }
  suggestions(query: string) {
    return query.trim()
      ? this.fandomMatches(query)
          .slice(0, 12)
          .map((m) => m.fandom)
      : this.popular.slice(0, 12);
  }
  search(query: string, fandomId?: number): Creator[] {
    if (fandomId !== undefined)
      return [...(this.byFandom.get(fandomId) || [])].sort((a, b) =>
        compareNames(a.name, b.name),
      );
    if (!query.trim()) return this.creators;
    const key = query.trim().toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key)!;
    const q = normalize(query),
      bq = boothKey(query),
      scores = new Map<Creator, Score>();
    if (!q) return [];
    for (const c of this.creators) {
      if (c.booths.some((b) => boothKey(b).startsWith(bq)))
        scores.set(c, { tier: -1, score: 2, coverage: 2, canonical: true });
      else {
        const score = fuzzyScore(q, c.name.toLowerCase());
        if (score >= 0.7)
          scores.set(c, {
            tier:
              q === normalize(c.name)
                ? 0
                : words(c.name).some((w) => w.startsWith(q))
                  ? 1
                  : 3,
            score,
            coverage: q.length / c.name.length,
            canonical: true,
          });
      }
    }
    for (const { fandom, score } of this.fandomMatches(query)) {
      for (const c of this.byFandom.get(fandom.id) || []) {
        const current = scores.get(c);
        if (!current || compare(score, current) < 0) scores.set(c, score);
      }
    }
    const result = [...scores]
      .sort((a, b) => compare(a[1], b[1]) || a[0].name.localeCompare(b[0].name))
      .map(([c]) => c);
    if (this.cache.size >= 60) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
}

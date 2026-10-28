import type {
  CatalogDocument,
  Creator,
  Fandom,
  RegistryDocument,
} from "./types";
import { boothKey, createBoothMatcher } from "./booths";
export { boothKey } from "./booths";
export const compareNames = (a: string, b: string) =>
  a.toLowerCase() < b.toLowerCase()
    ? -1
    : a.toLowerCase() > b.toLowerCase()
      ? 1
      : 0;
export const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");
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
  fandomDepth?: number;
};
const resultTier = {
  exactBooth: 0,
  boothPrefix: 1,
  exactCreator: 2,
  creatorPhrase: 3,
  exactFandom: 4,
  creatorPrefix: 5,
  fandomPrefix: 6,
  creatorSubstring: 7,
  fandomInitials: 8,
  fuzzy: 9,
} as const;
const fandomResultTiers = [
  resultTier.exactFandom,
  resultTier.fandomPrefix,
  resultTier.fandomInitials,
  resultTier.fuzzy,
];

/** Coverage uses the matched words, not unrelated words elsewhere in the name. */
function creatorScore(
  query: string,
  queryWords: string[],
  name: string,
): Score | null {
  const normalized = normalize(name);
  const nameWords = words(name);
  const match = (tier: number, coverage: number, score = 1): Score => ({
    tier,
    score,
    coverage,
    canonical: true,
  });
  if (query === normalized) return match(resultTier.exactCreator, 1);
  if (queryWords.length) {
    const coverage = (accept: (word: string, target: string) => boolean) => {
      let best = 0;
      for (
        let start = 0;
        start <= nameWords.length - queryWords.length;
        start++
      ) {
        const segment = nameWords.slice(start, start + queryWords.length);
        if (queryWords.every((word, i) => accept(word, segment[i])))
          best = Math.max(best, query.length / segment.join("").length);
      }
      return best;
    };
    if (coverage((word, target) => word === target))
      return match(resultTier.creatorPhrase, 1);
    const prefix = coverage((word, target) => target.startsWith(word));
    if (prefix) return match(resultTier.creatorPrefix, prefix);
    const substring = coverage((word, target) => target.includes(word));
    if (substring) return match(resultTier.creatorSubstring, substring);
  }
  const score = fuzzyScore(query, name.toLowerCase());
  return score >= 0.7
    ? match(resultTier.fuzzy, query.length / normalized.length, score)
    : null;
}
const compare = (a: Score, b: Score) =>
  a.tier - b.tier ||
  Number(b.canonical) - Number(a.canonical) ||
  b.score - a.score ||
  b.coverage - a.coverage ||
  (a.fandomDepth ?? 0) - (b.fandomDepth ?? 0);
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
          icon: c.assets?.icon,
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
        compare(a.score, b.score) || compareNames(a.fandom.name, b.fandom.name),
    );
  }
  suggestions(query: string, fandomId?: number) {
    if (fandomId === undefined && !query.trim())
      return this.popular.slice(0, 12);
    const matches =
      fandomId === undefined
        ? this.fandomMatches(query)
            .slice(0, 12)
            .map((m) => m.fandom)
        : [this.fandoms.get(fandomId)].filter((f): f is Fandom => !!f);
    const parents = new Set(matches.map((f) => f.id));
    // Registry ancestry is shared with creator filtering. Include descendants
    // even when their own names do not contain the matched parent's name.
    const children = this.popular.filter(
      (f) =>
        !parents.has(f.id) &&
        [...this.ancestors(f.id).keys()].some((id) => parents.has(id)),
    );
    return [...matches, ...children];
  }
  search(query: string, fandomId?: number): Creator[] {
    if (fandomId !== undefined)
      return [...(this.byFandom.get(fandomId) || [])]
        .map((creator) => ({
          creator,
          depth: this.fandomDepth(creator, fandomId),
        }))
        .sort(
          (a, b) =>
            a.depth - b.depth || compareNames(a.creator.name, b.creator.name),
        )
        .map(({ creator }) => creator);
    if (!query.trim()) return this.creators;
    const key = query.trim().toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key)!;
    const q = normalize(query),
      queryWords = words(query),
      matchBooth = createBoothMatcher(query),
      scores = new Map<Creator, Score>();
    if (!q) return [];
    for (const c of this.creators) {
      const boothMatches = c.booths.map(matchBooth);
      if (boothMatches.some(Boolean))
        scores.set(c, {
          tier: boothMatches.includes("exact")
            ? resultTier.exactBooth
            : resultTier.boothPrefix,
          score: 2,
          coverage: 2,
          canonical: true,
        });
      else {
        const score = creatorScore(q, queryWords, c.name);
        if (score) scores.set(c, score);
      }
    }
    for (const { fandom, score } of this.fandomMatches(query)) {
      for (const c of this.byFandom.get(fandom.id) || []) {
        const candidate = {
          ...score,
          tier: fandomResultTiers[score.tier],
          fandomDepth: this.fandomDepth(c, fandom.id),
        };
        const current = scores.get(c);
        if (!current || compare(candidate, current) < 0)
          scores.set(c, candidate);
      }
    }
    const result = [...scores]
      .sort((a, b) => compare(a[1], b[1]) || compareNames(a[0].name, b[0].name))
      .map(([c]) => c);
    if (this.cache.size >= 60) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
  hasExactBoothMatch(query: string) {
    const match = createBoothMatcher(query);
    return [...this.byBooth.keys()].some((code) => match(code) === "exact");
  }
  private fandomDepth(creator: Creator, fandomId: number) {
    return Math.min(
      ...creator.fandoms.map(
        (f) => this.ancestors(f.id).get(fandomId) ?? Infinity,
      ),
    );
  }
}

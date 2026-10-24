import { boothKey, type Catalog } from "./search";
import { telemetryId } from "./eventId";
import type {
  Emit,
  Fields,
  ListScope,
  SearchSource,
  SearchTrigger,
} from "../data/analyticsEvents";
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const isSearchLink = (text: string) => {
  try {
    const params = new URL(text, "https://cf23-map.nnt.gg").searchParams;
    return ["list", "custom_list", "creator", "creator_id", "fandom"].some(
      (k) => params.has(k),
    );
  } catch {
    return true;
  }
};
export interface SearchContext {
  catalog: Catalog;
  scope: ListScope;
  origin: ListScope;
  custom: Set<number> | null;
}
/** Raw query text remains local; only resolved registry IDs cross the event boundary. */
export class SearchTracking {
  private key = "";
  private query = "";
  private source: SearchSource = "typed";
  private explicit?: number;
  private id?: string;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private emit: Emit,
    private context: () => SearchContext | null,
    private activity: () => void,
  ) {}
  reset() {
    clearTimeout(this.timer);
    this.key = "";
    this.query = "";
    this.id = undefined;
    this.explicit = undefined;
  }
  private set(
    query: string,
    source: SearchSource = "typed",
    explicit?: number,
  ) {
    const c = this.context();
    const key = `${normalize(query)}|${c?.scope}|${c?.origin}`;
    if (this.key === key) return;
    clearTimeout(this.timer);
    this.key = key;
    this.query = query;
    this.source = source;
    this.explicit = explicit;
    this.id = undefined;
  }
  changed(query: string) {
    if (this.explicit !== undefined && query !== this.query) {
      this.explicit = undefined;
      this.key = "";
    }
    this.emit("search_opened", {});
    this.activity();
    if (isSearchLink(query)) {
      this.reset();
      return;
    }
    this.set(query);
    clearTimeout(this.timer);
    if (query.trim())
      this.timer = setTimeout(() => this.commit("settled"), 1000);
  }
  select(id: number, source: SearchSource) {
    const f = this.context()?.catalog.fandoms.get(id);
    if (!f) return;
    this.emit("search_opened", {});
    this.set(f.name, source, id);
    if (!this.id) {
      this.explicit = id;
      this.source = source;
    }
    return this.commit("selection");
  }
  submit(query: string) {
    if (isSearchLink(query)) {
      this.reset();
      return;
    }
    if (query.trim()) this.emit("search_opened", {});
    this.set(query);
    return this.commit("submitted");
  }
  result(query: string) {
    if (!query.trim() || isSearchLink(query)) return;
    this.set(query);
    return this.commit("result");
  }
  private commit(trigger: SearchTrigger) {
    clearTimeout(this.timer);
    const c = this.context();
    if (!this.query.trim() || !c) return;
    if (this.id) return this.id;
    const q = normalize(this.query);
    let fandomId = this.explicit;
    let resolution: Fields["search_performed"]["resolution"] = "unresolved";
    if (fandomId !== undefined) resolution = "explicit_selection";
    else {
      const all = [...c.catalog.fandoms.values()];
      const canonical = all.filter((f) => normalize(f.name) === q);
      const aliases = all.filter((f) =>
        f.alternateNames.some((n) => normalize(n) === q),
      );
      if (canonical.length === 1) {
        fandomId = canonical[0].id;
        resolution = "canonical";
      } else if (canonical.length > 1) resolution = "ambiguous";
      else if (aliases.length === 1) {
        fandomId = aliases[0].id;
        resolution = "alias";
      } else if (aliases.length > 1) resolution = "ambiguous";
      else if (c.catalog.creators.some((c) => normalize(c.name) === q))
        resolution = "creator";
      else if (c.catalog.byBooth.has(boothKey(this.query)))
        resolution = "booth";
      else {
        const prefixes = new Set(
          all
            .filter((f) =>
              [f.name, ...f.alternateNames].some((name) =>
                normalize(name).startsWith(q),
              ),
            )
            .map((f) => f.id),
        );
        if (prefixes.size === 1) {
          fandomId = [...prefixes][0];
          resolution = "unique_prefix";
        } else if (prefixes.size > 1) resolution = "ambiguous";
      }
    }
    this.id = telemetryId();
    if (!this.id) return;
    const results = c.catalog.search(this.query, this.explicit);
    this.emit("search_performed", {
      search_id: this.id,
      source: this.source,
      trigger,
      resolution,
      ...(fandomId === undefined ? {} : { fandom_id: fandomId }),
      result_count: results.filter((r) => !c.custom || c.custom.has(r.id))
        .length,
      catalog_result_count: results.length,
      scope: c.scope,
      origin_scope: c.origin,
    });
    return this.id;
  }
}

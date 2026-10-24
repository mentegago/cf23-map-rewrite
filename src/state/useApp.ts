import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Catalog } from "../domain/search";
import type { Creator, Snapshot } from "../domain/types";
import { emptySearch, type SearchSelection } from "../domain/searchSelection";
import { loadSnapshot, refreshSnapshot } from "../data/snapshots";
import {
  loadFavorites,
  readLocal,
  saveFavorites,
  writeLocal,
} from "../data/storage";
import {
  loadProfile,
  recordFandom,
  recordInteraction,
  saveProfile,
  interests,
} from "../domain/recommendations";
import { parseLink, encodeList, shareURL } from "../domain/links";
import { searchCollapsed } from "../components/Sheet";
import { useRecommendations } from "./useRecommendations";
import { analytics } from "../data/analytics";
import type {
  ListScope,
  SelectionSource,
  SearchSource,
} from "../data/analyticsEvents";
import { SearchTracking, type SearchContext } from "../domain/searchTracking";
import { telemetryId } from "../domain/eventId";
export function useApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [searchSelection, setSearchSelection] =
      useState<SearchSelection>(emptySearch),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [showDetail, setShowDetail] = useState(false),
    [custom, setCustom] = useState<Set<number> | null>(null),
    [favorites, setFavorites] = useState(loadFavorites),
    [profile, setProfile] = useState(loadProfile),
    [toast, setToast] = useState(""),
    [gallery, setGallery] = useState<Creator | null>(null),
    [selector, setSelector] = useState<{
      booth: string;
      creators: Creator[];
    } | null>(null),
    [searchExtent, setSearchExtent] = useState(searchCollapsed(innerHeight)),
    [detailExtent, setDetailExtent] = useState(0.56),
    [online, setOnline] = useState(navigator.onLine);
  const seed = useRef(
    readLocal<number>(
      "flutter.recommendation_seed",
      Math.floor(Math.random() * 2147483647),
    ),
  );
  const catalog = useMemo(
    () => (snapshot ? new Catalog(snapshot.catalog, snapshot.registry) : null),
    [snapshot?.catalog, snapshot?.registry],
  );
  const current = useRef(snapshot);
  const fandomId =
    searchSelection.kind === "fandom" ? searchSelection.id : undefined;
  const query =
    searchSelection.kind === "text"
      ? searchSelection.text
      : catalog?.fandoms.get(searchSelection.id)?.name || "";
  const started = useRef(performance.now());
  const scope = useRef<{ current: ListScope; origin: ListScope }>({
    current: "full_catalog",
    origin: "full_catalog",
  });
  const searchContext = useRef<SearchContext | null>(null);
  searchContext.current = catalog
    ? {
        catalog,
        custom,
        scope: scope.current.current,
        origin: scope.current.origin,
      }
    : null;
  const tracking = useRef<SearchTracking | null>(null);
  tracking.current ??= new SearchTracking(
    analytics.emit,
    () => searchContext.current,
    analytics.activity,
  );
  useEffect(() => {
    analytics.start();
    return () => tracking.current?.reset();
  }, []);
  const announcedReady = useRef(false);
  useEffect(() => {
    if (catalog && snapshot) {
      analytics.configure(catalog, snapshot.version);
      if (!announcedReady.current) {
        announcedReady.current = true;
        analytics.emit("app_ready", {
          duration_ms: Math.round(performance.now() - started.current),
          source: snapshot.source || "bundled",
        });
      }
    }
  }, [catalog, snapshot?.version]);
  current.current = snapshot;
  const busy = useRef(false);
  const notify = useCallback((text: string) => setToast(text), []);
  const retry = useCallback(() => {
    setError("");
    loadSnapshot()
      .then(setSnapshot)
      .catch(() => {
        setError(
          "Could not load the map. Check your connection and try again.",
        );
      });
  }, []);
  useEffect(retry, [retry]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    saveProfile(profile);
    writeLocal("flutter.recommendation_seed", seed.current);
  }, [profile]);
  useEffect(() => {
    const check = async () => {
      if (busy.current || !current.current || !navigator.onLine) return;
      busy.current = true;
      try {
        const next = await refreshSnapshot(current.current);
        if (next) {
          setSnapshot(next);
          notify("Creator booth list updated");
        }
      } catch {
        /* Offline or partial deployments keep the current snapshot. */
        analytics.emit("operation_failed", {
          operation: "catalog_load",
          code: "network",
        });
      } finally {
        busy.current = false;
      }
    };
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void check();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(check, 3600000);
    const initial = setTimeout(check, 1200);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [!!snapshot, notify]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === "flutter.favorite_creator_ids")
        setFavorites(loadFavorites());
      if (e.key === "flutter.recommendation_profile_v2")
        setProfile(loadProfile());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const interaction = (
    id: number,
    action: "open" | "gallery" | "link" | "catalog" | "share" | "favorite",
    favorite?: boolean,
  ) => {
    setProfile((p) =>
      recordInteraction(
        p,
        id,
        action === "catalog" ? "link" : action,
        favorite,
      ),
    );
  };
  const select = (
    c: Creator,
    push = true,
    source: SelectionSource = "list",
  ) => {
    const searchId =
      source === "list" ? tracking.current!.result(query) : undefined;
    if (source !== "list") tracking.current!.reset();
    analytics.emit("creator_opened", {
      creator_id: c.id,
      source: !push ? "deeplink" : searchId ? "search_result" : source,
      ...(searchId
        ? {
            search_id: searchId,
            result_position: results.findIndex((r) => r.id === c.id) + 1,
          }
        : {}),
    });
    analytics.emit("search_closed", { reason: "creator_selected" });
    setSelectedId(c.id);
    setShowDetail(true);
    setDetailExtent(0.56);
    setSelector(null);
    interaction(c.id, "open");
    (document.activeElement as HTMLElement)?.blur();
    if (push) {
      const u = new URL(location.href);
      u.searchParams.delete("creator");
      u.searchParams.set("creator_id", String(c.id));
      history.pushState(null, "", u);
    }
  };
  const close = () => {
    if (selectedId !== null)
      analytics.emit("creator_closed", {
        creator_id: selectedId,
        reason: "dismissed",
      });
    setSelectedId(null);
    setShowDetail(false);
    const u = new URL(location.href);
    u.searchParams.delete("creator_id");
    u.searchParams.delete("creator");
    history.replaceState(null, "", u);
  };
  const applyLink = (text: string, initial = false) => {
    if (!catalog) return false;
    const link = parseLink(text);
    if (!link) return false;
    tracking.current!.reset();
    const params = new URL(text, location.href).searchParams;
    const type = (
      ["list", "custom_list", "creator_id", "creator"] as const
    ).find((k) => params.has(k));
    const report = (success: boolean, count = 0) => {
      if (type)
        analytics.emit("deeplink_processed", {
          type,
          success,
          count,
          source: initial ? "initial" : "pasted",
        });
      if (!success)
        analytics.emit("operation_failed", {
          operation: "deeplink",
          code: "invalid_input",
        });
    };
    if (link.kind === "fandom") {
      searchFandom(link.id, {
        history: initial ? "none" : "push",
        record: false,
      });
      report(
        catalog.fandoms.has(link.id),
        catalog.fandoms.has(link.id) ? 1 : 0,
      );
      return true;
    } else if (link.kind === "list") {
      if (link.ids.every((id) => catalog.byId.has(id))) {
        setCustom(new Set(link.ids));
        scope.current = { current: "shared_list", origin: "shared_list" };
        analytics.emit("list_scope_changed", {
          scope: "shared_list",
          count: link.ids.length,
          origin_scope: "shared_list",
        });
        setSearchSelection(emptySearch);
        setShowDetail(false);
        setSelectedId(null);
        if (!initial) {
          const u = new URL(location.href);
          u.search = "";
          u.searchParams.set("list", encodeList(link.ids));
          history.pushState(null, "", u);
        }
        report(true, link.ids.length);
        return true;
      }
    } else if (link.kind === "creator" || link.kind === "name") {
      const c =
        link.kind === "creator"
          ? catalog.byId.get(link.id)
          : catalog.creators.find(
              (c) => c.name.toLowerCase() === link.name.toLowerCase(),
            ) ||
            catalog.creators.find((c) =>
              c.name.toLowerCase().includes(link.name.toLowerCase()),
            );
      if (c) {
        const fandom = parseLink(
          `?fandom=${new URL(text, location.href).searchParams.get("fandom") ?? ""}`,
        );
        if (fandom?.kind === "fandom")
          searchFandom(fandom.id, { history: "none", record: false });
        select(c, false, "deeplink");
        report(true, 1);
        return true;
      }
    }
    notify("This link does not match the current creator catalog.");
    report(false);
    return true;
  };
  const initialApplied = useRef(false);
  useEffect(() => {
    if (catalog && !initialApplied.current) {
      initialApplied.current = true;
      applyLink(location.href, true);
    }
  }, [catalog]);
  useEffect(() => {
    const pop = () => {
      setSelectedId(null);
      setShowDetail(false);
      setCustom(null);
      tracking.current!.reset();
      scope.current = { current: "full_catalog", origin: "full_catalog" };
      analytics.emit("creator_closed", { reason: "dismissed" });
      setSearchSelection(emptySearch);
      applyLink(location.href, true);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [catalog]);
  useEffect(() => {
    if (!catalog || fandomId === undefined) return;
    if (!catalog.fandoms.has(fandomId)) {
      setSearchSelection(emptySearch);
      const url = new URL(location.href);
      url.searchParams.delete("fandom");
      history.replaceState(null, "", url);
      notify("This fandom is no longer in the catalog. Showing all creators.");
    }
  }, [catalog, fandomId, notify]);
  const creators = useMemo(
    () => catalog?.creators.filter((c) => !custom || custom.has(c.id)) || [],
    [catalog, custom],
  );
  const results = useMemo(
    () =>
      catalog
        ?.search(query, fandomId)
        .filter((c) => !custom || custom.has(c.id)) || [],
    [catalog, query, fandomId, custom],
  );
  const favoriteCreators = useMemo(
    () => catalog?.creators.filter((c) => favorites.has(c.id)) || [],
    [catalog, favorites],
  );
  useEffect(() => {
    if (!gallery) return;
    analytics.emit("gallery_action", {
      creator_id: gallery.id,
      action: "open",
      count: gallery.assets.gallery.length,
    });
    return () =>
      analytics.emit("gallery_action", {
        creator_id: gallery.id,
        action: "close",
      });
  }, [gallery?.id]);
  const recommendationIds = useRecommendations(
    snapshot,
    profile,
    favorites,
    seed.current,
  );
  const recommendations = useMemo(
    () =>
      custom
        ? []
        : recommendationIds
            .map((id) => catalog?.byId.get(id))
            .filter((c): c is Creator => !!c && !favorites.has(c.id)),
    [recommendationIds, catalog, custom, favorites],
  );
  const suggestions = useMemo(() => {
    if (!catalog) return [];
    if (query.trim()) return catalog.suggestions(query);
    const ranked = [...interests(catalog, profile, favorites)]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => catalog.fandoms.get(id)!)
      .filter(Boolean);
    return [
      ...new Map(
        [...ranked, ...catalog.popular].map((f) => [f.id, f]),
      ).values(),
    ].slice(0, 20);
  }, [catalog, query, profile, favorites]);
  const search = (text: string) => {
    analytics.emit("creator_closed", { reason: "search_opened" });
    tracking.current!.changed(text);
    const url = new URL(location.href);
    url.searchParams.delete("fandom");
    url.searchParams.delete("creator_id");
    url.searchParams.delete("creator");
    history.replaceState(null, "", url);
    setSearchSelection({ kind: "text", text });
    setSelectedId(null);
    setShowDetail(false);
    setSearchExtent(0.94);
  };
  const searchFandom = (
    id: number,
    {
      history: navigation = "push",
      record = true,
      source = "suggestion",
    }: {
      history?: "push" | "none";
      record?: boolean;
      source?: SearchSource;
    } = {},
  ) => {
    setSearchSelection({ kind: "fandom", id });
    setCustom(null);
    if (custom) {
      scope.current = { current: "full_catalog", origin: "full_catalog" };
      if (searchContext.current)
        searchContext.current = {
          ...searchContext.current,
          custom: null,
          scope: "full_catalog",
          origin: "full_catalog",
        };
      analytics.emit("list_scope_changed", {
        scope: "full_catalog",
        count: catalog?.creators.length || 0,
      });
    }
    analytics.emit("creator_closed", { reason: "search_opened" });
    if (record) tracking.current!.select(id, source);
    setSelectedId(null);
    setShowDetail(false);
    setSelector(null);
    const url = shareURL("fandom", id);
    if (navigation === "push" && url !== location.href)
      history.pushState(null, "", url);
    if (record) setProfile((p) => recordFandom(p, id));
    setSearchExtent(0.94);
  };
  const toggleFavorite = (id: number) => {
    analytics.emit("bookmark_changed", {
      creator_id: id,
      action: favorites.has(id) ? "remove" : "add",
      source: "individual",
    });
    setFavorites((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!saveFavorites(next)) {
        analytics.emit("operation_failed", {
          operation: "favorites_persistence",
          code: "storage",
        });
        notify(
          "Favorites saved for this session; browser storage is unavailable.",
        );
      }
      return next;
    });
    interaction(id, "favorite", !favorites.has(id));
  };
  const copy = async (text: string, message: string) => {
    let success = false;
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      try {
        success = document.execCommand("copy");
      } catch {
        /* Unavailable clipboard. */
      } finally {
        field.remove();
      }
    }
    if (!success)
      analytics.emit("operation_failed", {
        operation: "clipboard",
        code: "unavailable",
      });
    notify(
      success
        ? message
        : "Could not copy. Your browser blocked clipboard access.",
    );
    return success;
  };
  const shareCreator = (c: Creator) => {
    interaction(c.id, "share");
    void copy(shareURL("creator_id", c.id), "Creator link copied!").then(
      (success) =>
        analytics.emit("creator_action", {
          creator_id: c.id,
          action: "share",
          success,
        }),
    );
  };
  const showOnMap = (list: Creator[]) => {
    tracking.current!.reset();
    const nextScope = query ? "search_result_list" : "shared_list";
    scope.current = {
      current: nextScope,
      origin:
        nextScope === "search_result_list" ? scope.current.origin : nextScope,
    };
    analytics.emit("list_scope_changed", {
      scope: nextScope,
      count: list.length,
      origin_scope: scope.current.origin,
    });
    setCustom(new Set(list.map((c) => c.id)));
    setSearchSelection(emptySearch);
    close();
    const url = new URL(location.href);
    url.searchParams.delete("fandom");
    history.replaceState(null, "", url);
    setSearchExtent(searchCollapsed(innerHeight));
  };
  const fullList = () => {
    tracking.current!.reset();
    scope.current = { current: "full_catalog", origin: "full_catalog" };
    analytics.emit("list_scope_changed", {
      scope: "full_catalog",
      count: catalog?.creators.length || 0,
    });
    setCustom(null);
    setSearchSelection(emptySearch);
    const u = new URL(location.href);
    u.search = "";
    history.replaceState(null, "", u);
  };
  const addAll = () => {
    const operationId = telemetryId();
    const next = new Set(favorites);
    creators.forEach((c) => {
      if (!next.has(c.id))
        analytics.emit("bookmark_changed", {
          creator_id: c.id,
          action: "add",
          source: "bulk",
          operation_id: operationId,
        });
      next.add(c.id);
    });
    if (!saveFavorites(next))
      analytics.emit("operation_failed", {
        operation: "favorites_persistence",
        code: "storage",
      });
    analytics.emit("favorites_action", {
      action: "bulk_add",
      success: true,
      operation_id: operationId,
      requested: creators.length,
      added: next.size - favorites.size,
      skipped: creators.length - (next.size - favorites.size),
      failed: 0,
    });
    setFavorites(next);
    notify(`${next.size - favorites.size} creators added to favorites`);
  };
  const openGallery = (c: Creator) => {
    interaction(c.id, "gallery");
    setGallery(c);
  };
  return {
    snapshot,
    error,
    retry,
    catalog,
    query,
    fandomId,
    searchSelection,
    selected: catalog?.byId.get(selectedId!) || null,
    showDetail,
    custom,
    favorites,
    toast,
    gallery,
    setGallery,
    selector,
    setSelector,
    searchExtent,
    setSearchExtent,
    detailExtent,
    setDetailExtent,
    online,
    notify,
    select,
    close,
    applyLink,
    creators,
    results,
    favoriteCreators,
    recommendations,
    suggestions,
    search,
    openSearch: () => {
      analytics.emit("search_opened", {});
      analytics.emit("creator_closed", { reason: "search_opened" });
      setShowDetail(false);
      setSearchExtent(0.94);
    },
    submitSearch: () => tracking.current!.submit(query),
    clearSearch: () => {
      analytics.emit("search_cleared", {});
      tracking.current!.reset();
      const url = new URL(location.href);
      url.searchParams.delete("fandom");
      history.replaceState(null, "", url);
      setSearchSelection(emptySearch);
      close();
    },
    resumeDetail: () => {
      analytics.emit("search_closed", { reason: "back" });
      if (selectedId !== null)
        analytics.emit("creator_opened", {
          creator_id: selectedId,
          source: "list",
        });
      setShowDetail(true);
    },
    searchFandom,
    toggleFavorite,
    copy,
    shareCreator,
    showOnMap,
    fullList,
    addAll,
    openGallery,
    interaction,
    setShowDetail,
    shareFavorites: () => {
      void copy(
        shareURL("list", encodeList(favorites)),
        "Shareable Favorites URL copied!",
      ).then((success) =>
        analytics.emit("favorites_action", {
          action: "share",
          success,
          count: favorites.size,
        }),
      );
    },
    copyBooths: () => {
      void copy(
        favoriteCreators.flatMap((c) => c.booths).join(","),
        "Favorites booth codes copied!",
      ).then((success) =>
        analytics.emit("favorites_action", {
          action: "copy_booths",
          success,
          count: favorites.size,
        }),
      );
    },
  };
}
export type AppModel = ReturnType<typeof useApp>;

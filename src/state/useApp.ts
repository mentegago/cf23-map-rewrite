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
  const announcedReady = useRef(false);
  useEffect(() => {
    if (catalog && snapshot) {
      analytics.configure(catalog, snapshot.version);
      if (!announcedReady.current) {
        announcedReady.current = true;
        analytics.emit("app_ready", {
          duration_ms: Math.round(performance.now() - started.current),
          source: "bundled",
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
      .catch(() =>
        setError(
          "Could not load the map. Check your connection and try again.",
        ),
      );
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
    action: "open" | "gallery" | "link" | "share" | "favorite",
    favorite?: boolean,
  ) => {
    setProfile((p) => recordInteraction(p, id, action, favorite));
    if (action === "link" || action === "share")
      analytics.emit("creator_action", {
        creator_id: id,
        action: action === "link" ? "external_link" : "share",
        success: true,
      });
  };
  const select = (c: Creator, push = true) => {
    analytics.emit("creator_opened", {
      creator_id: c.id,
      source: !push ? "deeplink" : query ? "search_result" : "list",
    });
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
    if (link.kind === "fandom") {
      searchFandom(link.id, {
        history: initial ? "none" : "push",
        record: false,
      });
      return true;
    } else if (link.kind === "list") {
      if (link.ids.every((id) => catalog.byId.has(id))) {
        setCustom(new Set(link.ids));
        setSearchSelection(emptySearch);
        setShowDetail(false);
        setSelectedId(null);
        if (!initial) {
          const u = new URL(location.href);
          u.search = "";
          u.searchParams.set("list", encodeList(link.ids));
          history.pushState(null, "", u);
        }
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
        select(c, false);
        return true;
      }
    }
    notify("This link does not match the current creator catalog.");
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
    if (!query.trim() || !catalog) return;
    const timer = setTimeout(
      () =>
        analytics.emit("search_performed", {
          source: fandomId === undefined ? "typed" : "suggestion",
          trigger: "settled",
          resolution:
            fandomId === undefined ? "unresolved" : "explicit_selection",
          ...(fandomId === undefined ? {} : { fandom_id: fandomId }),
          result_count: results.length,
          catalog_result_count: catalog.search(query, fandomId).length,
          scope: custom ? "shared_list" : "full_catalog",
        }),
      600,
    );
    return () => clearTimeout(timer);
  }, [query, fandomId, catalog, results.length, custom]);
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
    }: {
      history?: "push" | "none";
      record?: boolean;
    } = {},
  ) => {
    setSearchSelection({ kind: "fandom", id });
    setCustom(null);
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
      if (!saveFavorites(next))
        notify(
          "Favorites saved for this session; browser storage is unavailable.",
        );
      return next;
    });
    interaction(id, "favorite", !favorites.has(id));
  };
  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      notify(
        ok ? message : "Could not copy. Your browser blocked clipboard access.",
      );
    }
  };
  const shareCreator = (c: Creator) => {
    interaction(c.id, "share");
    void copy(shareURL("creator_id", c.id), "Creator link copied!");
  };
  const showOnMap = (list: Creator[]) => {
    analytics.emit("list_scope_changed", {
      scope: query ? "search_result_list" : "shared_list",
      count: list.length,
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
    const next = new Set(favorites);
    creators.forEach((c) => {
      if (!next.has(c.id))
        analytics.emit("bookmark_changed", {
          creator_id: c.id,
          action: "add",
          source: "bulk",
        });
      next.add(c.id);
    });
    saveFavorites(next);
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
    shareFavorites: () =>
      copy(
        shareURL("list", encodeList(favorites)),
        "Shareable Favorites URL copied!",
      ),
    copyBooths: () =>
      copy(
        favoriteCreators.flatMap((c) => c.booths).join(","),
        "Favorites booth codes copied!",
      ),
  };
}
export type AppModel = ReturnType<typeof useApp>;

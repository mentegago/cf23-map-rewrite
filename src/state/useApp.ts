import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Catalog, normalize } from "../domain/search";
import { fandomRanks, searchFandomRanks } from "../domain/fandomOrdering";
import type { Creator, Snapshot } from "../domain/types";
import { emptySearch, type SearchSelection } from "../domain/searchSelection";
import { loadSnapshot, refreshSnapshot } from "../data/snapshots";
import { loadFavorites, saveFavorites } from "../data/storage";
import {
  loadProfile,
  recordFandom,
  recordInteraction,
  saveProfile,
  rankedInterestedFandoms,
  type RecommendationSource,
} from "../domain/recommendations";
import { parseLink, resolveLink, encodeList, shareURL } from "../domain/links";
import { searchCollapsed } from "../components/Sheet";
import { useRecommendations } from "./useRecommendations";
import { analytics } from "../data/analytics";
import type {
  ListScope,
  SelectionSource,
  SearchSource,
  Fields,
} from "../data/analyticsEvents";
import { SearchTracking, type SearchContext } from "../domain/searchTracking";
import { telemetryId } from "../domain/eventId";
import { resetStandaloneURL, updateNavigationURL } from "./navigation";
import { useVisitRoute } from "./useVisitRoute";
import {
  loadCollections,
  saveCollections,
  mergeCreatorIds,
  type Collection,
} from "../data/collections";
export function useApp(mobile: boolean) {
  const [collections, setCollections] = useState(loadCollections);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [boothList, setBoothList] = useState<
      | { kind: "favorites" }
      | { kind: "custom"; ids: Set<number>; collectionId?: string }
      | null
    >(null),
    [listFandomIds, setListFandomIds] = useState<number[]>([]),
    [error, setError] = useState(""),
    [searchSelection, setSearchSelection] =
      useState<SearchSelection>(emptySearch),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [showDetail, setShowDetail] = useState(false),
    [creatorOrigin, setCreatorOrigin] = useState<SelectionSource>("list"),
    [galleryOrigin, setGalleryOrigin] = useState<SelectionSource>("list"),
    [favorites, setFavorites] = useState(loadFavorites),
    [profile, setProfile] = useState(loadProfile),
    [toast, setToast] = useState(""),
    [gallery, setGallery] = useState<Creator | null>(null),
    [selector, setSelector] = useState<{
      booth: string;
      creators: Creator[];
    } | null>(null),
    [searchExtent, setSearchExtent] = useState(searchCollapsed(innerHeight)),
    [searchScrollReset, setSearchScrollReset] = useState(0),
    [detailExtent, setDetailExtent] = useState(0.56),
    [online, setOnline] = useState(navigator.onLine);
  const catalog = useMemo(
    () => (snapshot ? new Catalog(snapshot.catalog, snapshot.registry) : null),
    [snapshot?.catalog, snapshot?.registry],
  );
  const favoritesMode = boothList?.kind === "favorites";
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
    source: RecommendationSource = "list",
  ) => {
    setProfile((p) =>
      recordInteraction(
        p,
        id,
        action === "catalog" ? "link" : action,
        favorite,
        source,
      ),
    );
  };
  const select = (
    c: Creator,
    push = true,
    source: SelectionSource = "list",
  ) => {
    const searchId =
      source === "list" && !boothList
        ? tracking.current!.result(query)
        : undefined;
    if (source !== "list") tracking.current!.reset();
    const resolvedSource: SelectionSource = !push
      ? "deeplink"
      : searchId
        ? "search_result"
        : source === "list" && boothList
          ? boothList.kind === "favorites"
            ? "favorites"
            : "custom_list"
          : source;
    setCreatorOrigin(resolvedSource);
    analytics.emit("creator_opened", {
      creator_id: c.id,
      source: resolvedSource,
      ...(resolvedSource === "visit_path" && visitRoute.routeId
        ? { route_id: visitRoute.routeId }
        : {}),
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
    interaction(
      c.id,
      "open",
      undefined,
      !push || source === "deeplink"
        ? "deeplink"
        : source === "map" || source === "random" || source === "recommendation"
          ? source
          : favoritesMode
            ? "favorites"
            : boothList?.kind === "custom"
              ? "custom_list"
              : query.trim()
                ? "search_result"
                : "list",
    );
    (document.activeElement as HTMLElement)?.blur();
    if (push) {
      const u = new URL(location.href);
      u.searchParams.delete("creator");
      u.searchParams.set("creator_id", String(c.id));
      updateNavigationURL(u, "push");
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
    updateNavigationURL(u, "replace");
  };
  const applyLink = (text: string, initial = false) => {
    if (!catalog) return false;
    const link = parseLink(text);
    if (!link) return false;
    const target = resolveLink(text, catalog);
    (document.activeElement as HTMLElement)?.blur();
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
      if (target?.kind === "list") {
        setBoothList({ kind: "custom", ids: new Set(link.ids) });
        if (
          boothList?.kind !== "custom" ||
          boothList.ids.size !== link.ids.length ||
          link.ids.some((id) => !boothList.ids.has(id))
        )
          setListFandomIds([]);
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
          updateNavigationURL(u, "push");
        }
        const creatorId = Number(params.get("creator_id"));
        if (params.has("creator_id") && catalog.byId.has(creatorId))
          select(catalog.byId.get(creatorId)!, false, "deeplink");
        report(true, link.ids.length);
        return true;
      }
    } else if (link.kind === "creator" || link.kind === "name") {
      const c = target?.kind === "creator" ? target.creator : undefined;
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
      resetStandaloneURL();
    }
  }, [catalog]);
  useEffect(() => {
    const pop = () => {
      setSelectedId(null);
      setShowDetail(false);
      setBoothList((previous) =>
        previous?.kind === "favorites" ||
        (previous?.kind === "custom" && previous.collectionId)
          ? previous
          : null,
      );
      tracking.current!.reset();
      scope.current = { current: "full_catalog", origin: "full_catalog" };
      analytics.emit("creator_closed", { reason: "dismissed" });
      setSearchSelection(emptySearch);
      applyLink(location.href, true);
      resetStandaloneURL();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [catalog, boothList, query]);
  useEffect(() => {
    if (!catalog || fandomId === undefined) return;
    if (!catalog.fandoms.has(fandomId)) {
      setSearchSelection(emptySearch);
      const url = new URL(location.href);
      url.searchParams.delete("fandom");
      updateNavigationURL(url, "replace");
      notify("This fandom is no longer in the catalog. Showing all creators.");
    }
  }, [catalog, fandomId, notify]);
  const creators = catalog?.creators || [];
  const results = useMemo(
    () => catalog?.search(query, fandomId) || [],
    [catalog, query, fandomId],
  );
  const searchLink = useMemo(
    () =>
      searchSelection.kind === "text" && catalog
        ? resolveLink(query, catalog)
        : null,
    [searchSelection, query, catalog],
  );
  const favoriteCreators = useMemo(
    () => catalog?.creators.filter((c) => favorites.has(c.id)) || [],
    [catalog, favorites],
  );
  const customListCreators = useMemo(() => {
    if (boothList?.kind !== "custom") return [];
    const ids = boothList.collectionId
      ? new Set(
          collections.find((item) => item.id === boothList.collectionId)?.ids ||
            [],
        )
      : boothList.ids;
    return catalog?.creators.filter((c) => ids.has(c.id)) || [];
  }, [catalog, boothList, collections]);
  const listCreators =
    boothList?.kind === "custom" ? customListCreators : favoriteCreators;
  const retainedList = useRef<{ scope: typeof boothList; ids: Set<number> }>({
    scope: null,
    ids: new Set(),
  });
  const listRowCreators = useMemo(() => {
    if (retainedList.current.scope !== boothList)
      retainedList.current = { scope: boothList, ids: new Set() };
    if (!boothList) return [];
    for (const creator of listCreators)
      retainedList.current.ids.add(creator.id);
    return (
      catalog?.creators.filter((c) => retainedList.current.ids.has(c.id)) || []
    );
  }, [boothList, listCreators, catalog]);
  const listFandoms = useMemo(() => {
    const counts = new Map<number, number>();
    for (const creator of listRowCreators)
      for (const id of new Set(creator.fandomIds))
        if (catalog?.fandoms.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts]
      .map(([id, count]) => ({ ...catalog!.fandoms.get(id)!, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.name.localeCompare(b.name) || a.id - b.id,
      );
  }, [listRowCreators, catalog]);
  const filteredListRows = useMemo(
    () =>
      listFandomIds.length
        ? listRowCreators.filter((c) =>
            c.fandomIds.some((id) => listFandomIds.includes(id)),
          )
        : listRowCreators,
    [listRowCreators, listFandomIds],
  );
  useEffect(() => {
    const available = new Set(listFandoms.map((f) => f.id));
    setListFandomIds((ids) =>
      ids.every((id) => available.has(id))
        ? ids
        : ids.filter((id) => available.has(id)),
    );
  }, [listFandoms]);
  const filteredListCreators = useMemo(() => {
    const available = new Set(listFandoms.map((f) => f.id));
    const selected = new Set(listFandomIds.filter((id) => available.has(id)));
    return selected.size
      ? listCreators.filter((c) => c.fandomIds.some((id) => selected.has(id)))
      : listCreators;
  }, [listCreators, listFandoms, listFandomIds]);
  const visitRoute = useVisitRoute(snapshot, filteredListCreators, boothList);
  const actionOrigin: SelectionSource = showDetail
    ? creatorOrigin
    : boothList
      ? favoritesMode
        ? "favorites"
        : "custom_list"
      : query.trim() || fandomId !== undefined
        ? "search_result"
        : "list";
  useEffect(() => {
    if (!boothList) return;
    const fields = { list_kind: boothList.kind, count: listCreators.length };
    analytics.emit("booth_list_action", { ...fields, action: "opened" });
    return () =>
      analytics.emit("booth_list_action", { ...fields, action: "closed" });
  }, [boothList]);
  useEffect(() => {
    if (!gallery) return;
    analytics.emit("gallery_action", {
      creator_id: gallery.id,
      action: "open",
      origin: galleryOrigin,
      count: gallery.assets.gallery.length,
    });
    return () =>
      analytics.emit("gallery_action", {
        creator_id: gallery.id,
        action: "close",
        origin: galleryOrigin,
      });
  }, [gallery?.id]);
  const recommendationEntries = useRecommendations(
    snapshot,
    profile,
    favorites,
    !!query.trim() ||
      fandomId !== undefined ||
      !!boothList ||
      (mobile && searchExtent < 0.3 && !showDetail && !gallery && !selector),
  );
  const recommendations = useMemo(
    () =>
      recommendationEntries
        .map(({ id }) => catalog?.byId.get(id))
        .filter((c): c is Creator => !!c),
    [recommendationEntries, catalog],
  );
  const recommendationFandomRanks = useMemo(
    () =>
      new Map(
        recommendationEntries.map((r) => [r.id, fandomRanks(r.matchingIds)]),
      ),
    [recommendationEntries],
  );
  const interestedFandoms = useMemo(
    () => (catalog ? rankedInterestedFandoms(catalog, profile, favorites) : []),
    [catalog, profile, favorites],
  );
  const interestFandomRanks = useMemo(
    () => fandomRanks(interestedFandoms.map((f) => f.id)),
    [interestedFandoms],
  );
  const matchedFandomRanks = useMemo(
    () =>
      catalog
        ? searchFandomRanks(catalog, query, fandomId)
        : new Map<number, number>(),
    [catalog, query, fandomId],
  );
  const suggestions = useMemo(() => {
    if (!catalog) return [];
    if (query.trim() || fandomId !== undefined)
      return catalog.suggestions(query, fandomId);
    const seen = new Set<string>();
    return [...interestedFandoms, ...catalog.popular]
      .filter((f) => {
        const key = normalize(f.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  }, [catalog, query, fandomId, interestedFandoms]);
  const search = (text: string) => {
    setBoothList(null);
    analytics.emit("creator_closed", { reason: "search_opened" });
    tracking.current!.changed(text);
    const url = new URL(location.href);
    url.searchParams.delete("fandom");
    url.searchParams.delete("creator_id");
    url.searchParams.delete("creator");
    updateNavigationURL(url, "replace");
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
    setBoothList(null);
    if (boothList) {
      scope.current = { current: "full_catalog", origin: "full_catalog" };
      if (searchContext.current)
        searchContext.current = {
          ...searchContext.current,
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
      updateNavigationURL(url, "push");
    if (record) setProfile((p) => recordFandom(p, id));
    setSearchExtent(0.94);
  };
  const toggleFavorite = (
    id: number,
    origin: SelectionSource = actionOrigin,
  ) => {
    analytics.emit("bookmark_changed", {
      creator_id: id,
      action: favorites.has(id) ? "remove" : "add",
      source: "individual",
      origin,
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
  const shareLink = async (
    url: string,
    title: string,
    copiedMessage: string,
    fields: Pick<
      Fields["share_action"],
      "target" | "creator_id" | "count" | "origin"
    >,
  ) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        analytics.emit("share_action", {
          ...fields,
          method: "native",
          outcome: "shared",
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          analytics.emit("share_action", {
            ...fields,
            method: "native",
            outcome: "cancelled",
          });
          return false;
        }
      }
    }
    const success = await copy(url, copiedMessage);
    analytics.emit("share_action", {
      ...fields,
      method: "clipboard",
      outcome: success ? "copied" : "failed",
    });
    return success;
  };
  const shareCreator = (c: Creator) => {
    interaction(c.id, "share");
    void shareLink(
      shareURL("creator_id", c.id),
      c.name,
      "Creator link copied!",
      { target: "creator", creator_id: c.id, origin: creatorOrigin },
    ).then((success) =>
      analytics.emit("creator_action", {
        creator_id: c.id,
        action: "share",
        origin: creatorOrigin,
        success,
      }),
    );
  };
  const fullList = () => {
    setBoothList(null);
    tracking.current!.reset();
    scope.current = { current: "full_catalog", origin: "full_catalog" };
    analytics.emit("list_scope_changed", {
      scope: "full_catalog",
      count: catalog?.creators.length || 0,
    });
    setSearchSelection(emptySearch);
    const u = new URL(location.href);
    u.search = "";
    updateNavigationURL(u, "replace");
  };
  const addAll = (ids = listCreators.map((c) => c.id)) => {
    const operationId = telemetryId();
    const next = new Set(favorites);
    ids.forEach((id) => {
      if (!next.has(id))
        analytics.emit("bookmark_changed", {
          creator_id: id,
          action: "add",
          source: "bulk",
          origin: favoritesMode ? "favorites" : "custom_list",
          operation_id: operationId,
        });
      next.add(id);
    });
    if (!saveFavorites(next)) {
      analytics.emit("operation_failed", {
        operation: "favorites_persistence",
        code: "storage",
      });
      notify("Couldn't save favorites. Your device storage may be full.");
      return false;
    }
    analytics.emit("favorites_action", {
      action: "bulk_add",
      success: true,
      operation_id: operationId,
      requested: ids.length,
      added: next.size - favorites.size,
      skipped: ids.length - (next.size - favorites.size),
      failed: 0,
    });
    setFavorites(next);
    notify(`${next.size - favorites.size} creators added to favorites`);
    return true;
  };
  const openGallery = (c: Creator, origin: SelectionSource = actionOrigin) => {
    setGalleryOrigin(origin);
    interaction(c.id, "gallery");
    setGallery(c);
  };
  const clearSearch = () => {
    analytics.emit("search_cleared", {});
    tracking.current!.reset();
    const url = new URL(location.href);
    url.searchParams.delete("fandom");
    updateNavigationURL(url, "replace");
    setSearchSelection(emptySearch);
    close();
  };
  const updateCollections = (next: Collection[]) => {
    if (!saveCollections(next)) {
      notify("Couldn't save this collection. Your device storage may be full.");
      return false;
    }
    setCollections(next);
    return true;
  };
  const activeCollection =
    boothList?.kind === "custom"
      ? collections.find((c) => c.id === boothList.collectionId)
      : undefined;
  return {
    collections,
    activeCollection,
    openCollection: (collection: Collection) => {
      fullList();
      close();
      setListFandomIds([]);
      setBoothList({
        kind: "custom",
        ids: new Set(collection.ids),
        collectionId: collection.id,
      });
      scope.current = { current: "shared_list", origin: "shared_list" };
    },
    saveToCollection: (
      id: string | null,
      name = "",
      incoming = listCreators.map((c) => c.id),
    ) => {
      const existing = collections.find((c) => c.id === id);
      const title = existing?.name || name.trim();
      if (!title) return false;
      const ids = mergeCreatorIds(existing?.ids || [], incoming);
      const item = {
        id:
          existing?.id ||
          telemetryId() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: title,
        ids,
      };
      if (
        !updateCollections(
          existing
            ? collections.map((c) => (c.id === id ? item : c))
            : [...collections, item],
        )
      )
        return false;
      const added = ids.length - (existing?.ids.length || 0);
      notify(
        !existing
          ? `Created ${title}`
          : added
            ? `Added ${added} creators to ${title}`
            : "Already in this collection",
      );
      return true;
    },
    renameCollection: (name: string) =>
      !!activeCollection &&
      !!name.trim() &&
      updateCollections(
        collections.map((c) =>
          c.id === activeCollection.id ? { ...c, name: name.trim() } : c,
        ),
      ),
    toggleCollectionCreator: (id: number) =>
      activeCollection &&
      updateCollections(
        collections.map((c) =>
          c.id === activeCollection.id
            ? {
                ...c,
                ids: c.ids.includes(id)
                  ? c.ids.filter((value) => value !== id)
                  : [...c.ids, id],
              }
            : c,
        ),
      ),
    deleteCollection: () => {
      if (
        activeCollection &&
        updateCollections(
          collections.filter((c) => c.id !== activeCollection.id),
        )
      ) {
        setBoothList(null);
        close();
        fullList();
        return true;
      }
      return false;
    },
    creatorOrigin,
    galleryOrigin,
    visitRoute,
    favoritesMode,
    boothList,
    openFavorites: () => {
      setListFandomIds([]);
      fullList();
      close();
      setBoothList({ kind: "favorites" });
      scope.current = { current: "shared_list", origin: "shared_list" };
      analytics.emit("list_scope_changed", {
        scope: "shared_list",
        origin_scope: "shared_list",
        count: favoriteCreators.length,
      });
    },
    closeBoothList: () => {
      setBoothList(null);
      close();
      fullList();
    },
    snapshot,
    error,
    retry,
    catalog,
    query,
    fandomId,
    searchSelection,
    selected: catalog?.byId.get(selectedId!) || null,
    showDetail,
    favorites,
    toast,
    gallery,
    setGallery,
    selector,
    setSelector,
    searchExtent,
    searchScrollReset,
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
    searchLink,
    favoriteCreators,
    listCreators,
    listRowCreators,
    filteredListRows,
    listFandoms,
    listFandomIds,
    filteredListCreators,
    toggleListFandom: (id: number) => {
      const removing = listFandomIds.includes(id);
      const next = removing
        ? listFandomIds.filter((value) => value !== id)
        : [...listFandomIds, id];
      setListFandomIds(next);
      analytics.emit("booth_list_action", {
        action: removing ? "filter_remove" : "filter_add",
        list_kind: boothList!.kind,
        fandom_id: id,
        selected_count: next.length,
        count: next.length
          ? listCreators.filter((c) =>
              c.fandomIds.some((id) => next.includes(id)),
            ).length
          : listCreators.length,
      });
    },
    clearListFandoms: () => {
      if (!listFandomIds.length) return;
      setListFandomIds([]);
      analytics.emit("booth_list_action", {
        action: "filter_clear",
        list_kind: boothList!.kind,
        selected_count: 0,
        count: listCreators.length,
      });
    },
    recommendations,
    recommendationFandomRanks,
    interestFandomRanks,
    matchedFandomRanks,
    suggestions,
    search,
    openSearch: () => {
      if (boothList) fullList();
      analytics.emit("search_opened", {});
      analytics.emit("creator_closed", { reason: "search_opened" });
      setShowDetail(false);
      setSearchExtent(0.94);
    },
    submitSearch: () => tracking.current!.submit(query),
    clearSearch,
    dismissSearch: () => {
      clearSearch();
      setSearchScrollReset((revision) => revision + 1);
      (document.activeElement as HTMLElement)?.blur();
      setSearchExtent(searchCollapsed(innerHeight));
    },
    searchFandom,
    toggleFavorite,
    copy,
    shareCreator,
    addAll,
    openGallery,
    interaction,
    setShowDetail,
    shareFavorites: () => {
      void shareLink(
        shareURL("list", encodeList(favorites)),
        "CF23 Map · Favorites",
        "Shareable Favorites URL copied!",
        { target: "favorites", count: favorites.size },
      ).then((success) =>
        analytics.emit("favorites_action", {
          action: "share",
          success,
          count: favorites.size,
        }),
      );
    },
    shareBoothList: () => {
      void shareLink(
        shareURL("list", encodeList(listCreators.map((creator) => creator.id))),
        `CF23 Map · ${activeCollection?.name || "Booth list"}`,
        "Booth list link copied!",
        { target: "custom_list", count: listCreators.length },
      );
    },
  };
}
export type AppModel = ReturnType<typeof useApp>;

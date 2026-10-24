import { useLayoutEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Map as MapIcon, Share2, Plus, Copy } from "lucide-react";
import type { AppModel } from "../state/useApp";
import type { Creator } from "../domain/types";
import { CreatorRow } from "./CreatorRow";
type Row =
  | { type: "creator"; creator: Creator; recommendation?: boolean }
  | { type: "heading"; title: string; action?: "favorites" }
  | { type: "curated" }
  | { type: "share" }
  | { type: "empty" };
export function Directory({ app }: { app: AppModel }) {
  const ref = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const previousQuery = useRef(app.query);
  const previousFandom = useRef(app.fandomId);
  const rows = useMemo(() => {
    const r: Row[] = [];
    const add = (list: Creator[], recommendation = false) =>
      list.forEach((creator) =>
        r.push({ type: "creator", creator, recommendation }),
      );
    if (app.query.trim()) {
      r.push({
        type: "heading",
        title: `${app.results.length} result${app.results.length === 1 ? "" : "s"}`,
      });
      if (!app.results.length) r.push({ type: "empty" });
      add(app.results);
    } else {
      if (app.favoriteCreators.length) {
        r.push({ type: "heading", title: "Favorites", action: "favorites" });
        add(app.favoriteCreators);
        r.push({ type: "share" });
      }
      if (app.custom) r.push({ type: "curated" });
      else if (app.recommendations.length) {
        r.push({ type: "heading", title: "Creators you may like" });
        add(app.recommendations, true);
      }
      r.push({
        type: "heading",
        title: app.custom ? "Custom Creators List" : "All Comifuro 23 Creators",
      });
      add(app.creators);
    }
    return r;
  }, [
    app.query,
    app.results,
    app.favoriteCreators,
    app.custom,
    app.recommendations,
    app.creators,
  ]);
  const virtual = useVirtualizer({
    enabled: !app.showDetail,
    initialOffset: () => savedScroll.current,
    count: rows.length,
    getScrollElement: () => ref.current,
    estimateSize: (i) =>
      rows[i].type === "creator" ? 110 : rows[i].type === "curated" ? 225 : 54,
    overscan: 6,
    getItemKey: (i) =>
      rows[i].type === "creator"
        ? `${i}-${(rows[i] as { creator: Creator }).creator.id}`
        : `${i}-${rows[i].type}`,
  });
  useLayoutEffect(() => {
    const queryChanged =
      previousQuery.current !== app.query ||
      previousFandom.current !== app.fandomId;
    const offset = queryChanged ? 0 : savedScroll.current;
    savedScroll.current = offset;
    previousQuery.current = app.query;
    previousFandom.current = app.fandomId;
    if (!app.showDetail) {
      // Reset before paint, then reapply after virtual rows are measured. Capture
      // the target so a queued scroll event cannot replace it with the old offset.
      if (queryChanged) ref.current?.scrollTo({ top: 0, behavior: "instant" });
      virtual.scrollToOffset(offset);
      const frame = requestAnimationFrame(() => virtual.scrollToOffset(offset));
      return () => cancelAnimationFrame(frame);
    }
  }, [app.showDetail, app.query, app.fandomId, virtual]);
  return (
    <div
      ref={ref}
      className="sheet-scroll directory"
      data-testid="directory"
      onScroll={(e) => {
        if (!app.showDetail) savedScroll.current = e.currentTarget.scrollTop;
      }}
    >
      <div
        style={{
          height: virtual.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtual.getVirtualItems().map((v) => {
          const row = rows[v.index];
          return (
            <div
              key={v.key}
              ref={virtual.measureElement}
              data-index={v.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
              }}
            >
              {row.type === "creator" ? (
                <CreatorRow
                  creator={row.creator}
                  onSelect={(c) =>
                    app.select(
                      c,
                      true,
                      row.recommendation ? "recommendation" : "list",
                    )
                  }
                  onGallery={app.openGallery}
                />
              ) : row.type === "heading" ? (
                <div className="section-heading">
                  <span>{row.title}</span>
                  {row.action && (
                    <button
                      className="text-button"
                      onClick={() => app.showOnMap(app.favoriteCreators)}
                    >
                      <MapIcon size={15} />
                      Show on Map
                    </button>
                  )}
                  {row.action === "favorites" && (
                    <button
                      className="text-button"
                      onClick={app.shareFavorites}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        void app.copyBooths();
                      }}
                    >
                      <Share2 size={15} />
                      Share
                    </button>
                  )}
                </div>
              ) : row.type === "curated" ? (
                <div className="curated panel">
                  <span className="kicker">Curated route</span>
                  <p>
                    You’re viewing a curated creator list. Only the creators
                    selected by the list owner are shown on the map.
                  </p>
                  <button className="action pink" onClick={app.fullList}>
                    <ArrowLeft size={17} />
                    Return to Full Creator List
                  </button>
                  <button className="text-button" onClick={app.addAll}>
                    <Plus size={17} />
                    Add All to Favorites
                  </button>
                </div>
              ) : row.type === "share" ? (
                <div className="share-actions">
                  <button className="text-button" onClick={app.shareFavorites}>
                    <Share2 size={16} />
                    Share Favorites
                  </button>
                  <button className="text-button" onClick={app.copyBooths}>
                    <Copy size={16} />
                    Copy booth codes
                  </button>
                </div>
              ) : (
                <div className="empty">
                  <p>No creators found.</p>
                  <button
                    className="action cyan"
                    onClick={() => app.search("")}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

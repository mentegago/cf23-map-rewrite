import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AppModel } from "../state/useApp";
import type { Creator } from "../domain/types";
import { CreatorRow } from "./CreatorRow";
import { SearchLinkCard } from "./SearchLinkCard";
import { useDismissKeyboardOnSwipe } from "../state/useDismissKeyboardOnSwipe";
type Row =
  | { type: "creator"; creator: Creator; recommendation?: boolean }
  | { type: "heading"; title: string }
  | { type: "link" }
  | { type: "empty" };
export function Directory({
  app,
  searchInput,
}: {
  app: AppModel;
  searchInput: RefObject<HTMLInputElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissKeyboardOnSwipe(ref, searchInput);
  const savedScroll = useRef(0);
  const previousQuery = useRef(app.query);
  const previousFandom = useRef(app.fandomId);
  const previousReset = useRef(app.searchScrollReset);
  const rows = useMemo(() => {
    if (app.searchLink) return [{ type: "link" }] as Row[];
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
      if (app.recommendations.length) {
        r.push({ type: "heading", title: "Creators you may like" });
        add(app.recommendations, true);
      }
      r.push({
        type: "heading",
        title: "All Comifuro 23 Creators",
      });
      add(app.creators);
    }
    return r;
  }, [
    app.query,
    app.results,
    app.recommendations,
    app.creators,
    app.searchLink,
  ]);
  const virtual = useVirtualizer({
    enabled: !app.showDetail,
    initialOffset: () => savedScroll.current,
    count: rows.length,
    getScrollElement: () => ref.current,
    estimateSize: (i) =>
      rows[i].type === "link" ? 144 : rows[i].type === "creator" ? 110 : 54,
    overscan: 6,
    getItemKey: (i) =>
      rows[i].type === "creator"
        ? `${i}-${(rows[i] as { creator: Creator }).creator.id}`
        : `${i}-${rows[i].type}`,
  });
  useLayoutEffect(() => {
    const resetScroll =
      previousQuery.current !== app.query ||
      previousFandom.current !== app.fandomId ||
      previousReset.current !== app.searchScrollReset;
    const offset = resetScroll ? 0 : savedScroll.current;
    savedScroll.current = offset;
    previousQuery.current = app.query;
    previousFandom.current = app.fandomId;
    previousReset.current = app.searchScrollReset;
    if (!app.showDetail) {
      // Reset before paint, then reapply after virtual rows are measured. Capture
      // the target so a queued scroll event cannot replace it with the old offset.
      if (resetScroll) ref.current?.scrollTo({ top: 0, behavior: "instant" });
      virtual.scrollToOffset(offset);
      const frame = requestAnimationFrame(() => virtual.scrollToOffset(offset));
      return () => cancelAnimationFrame(frame);
    }
  }, [app.showDetail, app.query, app.fandomId, app.searchScrollReset, virtual]);
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
              {row.type === "link" && app.searchLink ? (
                <SearchLinkCard
                  target={app.searchLink}
                  onOpen={() => app.applyLink(app.query)}
                />
              ) : row.type === "creator" ? (
                <CreatorRow
                  creator={row.creator}
                  favorite={app.favorites.has(row.creator.id)}
                  onFavorite={(id) =>
                    app.toggleFavorite(
                      id,
                      row.recommendation ? "recommendation" : undefined,
                    )
                  }
                  onSelect={(c) =>
                    app.select(
                      c,
                      true,
                      row.recommendation ? "recommendation" : "list",
                    )
                  }
                  onGallery={(creator) =>
                    app.openGallery(
                      creator,
                      row.recommendation ? "recommendation" : undefined,
                    )
                  }
                />
              ) : row.type === "heading" ? (
                <div className="section-heading">
                  <span>{row.title}</span>
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

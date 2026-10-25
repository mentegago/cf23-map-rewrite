import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart, X, Share2, List } from "lucide-react";
import type { AppModel } from "../state/useApp";
import { CreatorRow } from "./CreatorRow";

function FavoriteRowExit({
  exiting,
  onExit,
  children,
}: {
  exiting: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const finish = useRef(onExit);
  finish.current = onExit;
  useLayoutEffect(() => {
    if (!exiting || !ref.current) return;
    const element = ref.current;
    const animation = element.animate(
      [
        {
          height: `${element.getBoundingClientRect().height}px`,
          opacity: 1,
          transform: "translateX(0)",
        },
        { height: "0px", opacity: 0, transform: "translateX(12px)" },
      ],
      {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 240,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "forwards",
      },
    );
    animation.onfinish = () => finish.current();
    return () => animation.cancel();
  }, [exiting]);
  return (
    <div ref={ref} className="favorite-row-presence" inert={exiting}>
      {children}
    </div>
  );
}

/** Shared content for the mobile sheet and desktop sidebar. */
export function BoothListSheet({
  app,
  onClose,
  onNavigate,
}: {
  app: AppModel;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const isFavorites = app.boothList?.kind === "favorites";
  const title = isFavorites ? "Favorites" : "Booth list";
  const allSaved = app.listCreators.every((c) => app.favorites.has(c.id));
  const scroll = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  useLayoutEffect(() => {
    const controls = controlsRef.current!;
    const measure = () =>
      setControlsHeight(controls.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);
  const closeButton = useRef<HTMLButtonElement>(null);
  const creators = app.filteredListCreators;
  const [rows, setRows] = useState(creators);
  useLayoutEffect(() => {
    setRows((previous) => {
      const next = [...creators];
      // Keep unsaved rows only for their exit animation, not for filter changes.
      previous.forEach((creator, index) => {
        if (
          isFavorites &&
          !app.favorites.has(creator.id) &&
          !next.some((c) => c.id === creator.id)
        )
          next.splice(Math.min(index, next.length), 0, creator);
      });
      return next;
    });
    // Virtual rows may leave the viewport mid-animation; still retire them.
    const timer = setTimeout(() => setRows(creators), 260);
    return () => clearTimeout(timer);
  }, [creators, app.favorites, isFavorites]);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 110,
    getItemKey: (i) => rows[i].id,
    overscan: 6,
    scrollMargin: controlsHeight,
  });
  useLayoutEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    virtual.measure();
  }, []);
  useLayoutEffect(() => {
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
    virtual.measure();
  }, [app.listFandomIds]);
  return (
    <>
      <header className="favorites-header" data-drag>
        <span className="favorites-heart" aria-hidden="true">
          {isFavorites ? (
            <Heart size={24} fill="currentColor" />
          ) : (
            <List size={24} />
          )}
        </span>
        <div>
          <h2>{title}</h2>
          <p>
            {app.listFandomIds.length ? `${creators.length} of ` : ""}
            {app.listCreators.length}{" "}
            {isFavorites ? "saved creator" : "creator"}
            {app.listCreators.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="favorites-actions">
          <div className="detail-action-group">
            <button
              className="icon-button"
              aria-label={isFavorites ? "Share Favorites" : "Share booth list"}
              onClick={isFavorites ? app.shareFavorites : app.shareBoothList}
              disabled={!app.listCreators.length}
            >
              <Share2 size={21} />
            </button>
          </div>
          <button
            ref={closeButton}
            className="icon-button favorites-close"
            aria-label={isFavorites ? "Close favorites" : "Close booth list"}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
      </header>
      <div
        ref={scroll}
        className="sheet-scroll favorites-list"
        aria-label={isFavorites ? "Saved creators" : "Listed creators"}
      >
        <div ref={controlsRef}>
          {!!creators.length && (
            <div className="booth-list-bulk">
              {!isFavorites && (
                <button
                  className="action pink"
                  aria-label={
                    allSaved ? "All saved to favorites" : "Favorite all"
                  }
                  onClick={app.addAll}
                  disabled={allSaved}
                >
                  {allSaved ? (
                    <Heart size={17} fill="currentColor" />
                  ) : (
                    <Heart size={17} />
                  )}
                  {allSaved ? "All saved" : "Favorite all"}
                </button>
              )}
              <button className="action cyan" onClick={onNavigate}>
                Navigate
              </button>
            </div>
          )}
          {!!app.listFandoms.length && (
            <div
              className="suggestions favorites-filters"
              role="group"
              aria-label={
                isFavorites
                  ? "Filter favorites by fandom"
                  : "Filter booth list by fandom"
              }
              tabIndex={0}
            >
              <button
                className="tag cyan-tint"
                aria-pressed={!app.listFandomIds.length}
                onClick={app.clearListFandoms}
              >
                All
              </button>
              {app.listFandoms.map((f) => (
                <button
                  key={f.id}
                  className="tag cyan-tint"
                  aria-pressed={app.listFandomIds.includes(f.id)}
                  onClick={() => app.toggleListFandom(f.id)}
                >
                  {f.name}
                  <span className="favorites-filter-count">{f.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {rows.length ? (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => (
              <div
                key={v.key}
                ref={virtual.measureElement}
                data-index={v.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${v.start - controlsHeight}px)`,
                }}
              >
                <FavoriteRowExit
                  exiting={isFavorites && !app.favorites.has(rows[v.index].id)}
                  onExit={() =>
                    setRows((current) =>
                      current.filter((c) => c.id !== rows[v.index].id),
                    )
                  }
                >
                  <CreatorRow
                    creator={rows[v.index]}
                    favorite={app.favorites.has(rows[v.index].id)}
                    onFavorite={app.toggleFavorite}
                    onSelect={(c) => app.select(c, true, "list")}
                    onGallery={app.openGallery}
                  />
                </FavoriteRowExit>
              </div>
            ))}
          </div>
        ) : (
          <div className="favorites-empty">
            <Heart size={40} aria-hidden="true" />
            <h3>
              {isFavorites ? "No favorites yet" : "No creators available"}
            </h3>
            <p>
              {isFavorites
                ? "Tap the heart on a creator to save them here."
                : "The creators in this list are no longer in the catalog."}
            </p>
            <button className="action cyan" onClick={onClose}>
              Browse creators
            </button>
          </div>
        )}
      </div>
    </>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart, X, List, MoreHorizontal, Plus } from "lucide-react";
import { ShareIcon } from "./ShareIcon";
import type { AppModel } from "../state/useApp";
import { CreatorRow } from "./CreatorRow";
import { useHorizontalWheel } from "../state/useHorizontalWheel";
import { CollectionDialog, CollectionPicker } from "./Collections";

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
  const horizontalWheel = useHorizontalWheel();
  const title =
    app.activeCollection?.name || (isFavorites ? "Favorites" : "Booth list");
  const [picker, setPicker] = useState(false);
  const [manage, setManage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(title);
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
  const creators = app.filteredListRows;
  const rows = creators;
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
            {app.activeCollection && (
              <button
                className="icon-button"
                aria-label="Manage collection"
                onClick={() => {
                  setName(title);
                  setManage(true);
                }}
              >
                <MoreHorizontal size={21} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={isFavorites ? "Share Favorites" : "Share booth list"}
              onClick={isFavorites ? app.shareFavorites : app.shareBoothList}
              disabled={!app.listCreators.length}
            >
              <ShareIcon />
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
              {!isFavorites && !app.activeCollection && (
                <button
                  className="action pink"
                  disabled={!app.listCreators.length}
                  onClick={() => setPicker(true)}
                >
                  <Plus size={17} /> Add all…
                </button>
              )}
              <button
                className="action cyan"
                disabled={!app.filteredListCreators.length}
                onClick={onNavigate}
              >
                Navigate
              </button>
            </div>
          )}
          {!!app.listFandoms.length && (
            <div
              className="suggestions favorites-filters"
              ref={horizontalWheel}
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
                <CreatorRow
                  creator={rows[v.index]}
                  favorite={
                    app.activeCollection
                      ? app.activeCollection.ids.includes(rows[v.index].id)
                      : app.favorites.has(rows[v.index].id)
                  }
                  collection={!!app.activeCollection}
                  onFavorite={
                    app.activeCollection
                      ? app.toggleCollectionCreator
                      : app.toggleFavorite
                  }
                  onSelect={(c) => app.select(c, true, "list")}
                  onGallery={app.openGallery}
                />
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
                : app.activeCollection
                  ? "Open a booth list and choose Add all… to add creators here."
                  : "The creators in this list are no longer in the catalog."}
            </p>
            <button className="action cyan" onClick={onClose}>
              Browse creators
            </button>
          </div>
        )}
      </div>
      {picker && (
        <CollectionPicker app={app} onClose={() => setPicker(false)} />
      )}
      {manage && (
        <CollectionDialog
          title="Manage collection"
          onClose={() => setManage(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (app.renameCollection(name)) setManage(false);
            }}
          >
            <label>
              Collection name
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="action cyan" disabled={!name.trim()}>
              Save name
            </button>
          </form>
          <button
            className="collection-remove"
            onClick={() => {
              setManage(false);
              setDeleting(true);
            }}
          >
            Delete collection
          </button>
        </CollectionDialog>
      )}
      {deleting && (
        <CollectionDialog
          title={`Delete ${title}?`}
          onClose={() => setDeleting(false)}
        >
          <p>Your favorites and other collections will be kept.</p>
          <button
            className="action pink"
            onClick={() => app.deleteCollection()}
          >
            Delete collection
          </button>
        </CollectionDialog>
      )}
    </>
  );
}

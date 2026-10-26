import { useLayoutEffect, useRef, useState } from "react";
import {
  Share2,
  X,
  Maximize,
  Minimize,
  ExternalLink,
  Images,
  CalendarDays,
  Link,
  Heart,
  Bookmark,
  FolderPlus,
  MapPin,
} from "lucide-react";
import type { AppModel } from "../state/useApp";
import { safeURL } from "../domain/links";
import { Artwork } from "./CreatorRow";
import { CollectionPicker } from "./Collections";
import { analytics } from "../data/analytics";
import { launchForAnalytics } from "../data/analyticsActions";
export function CreatorDetail({ app }: { app: AppModel }) {
  const c = app.selected!;
  const [expanded, setExpanded] = useState(false);
  const [collectionPicker, setCollectionPicker] = useState(false);
  const cut = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = cut.current!;
    const resize = new ResizeObserver(() => {
      el.style.height = `${el.clientWidth / (expanded ? 0.7 : 2)}px`;
    });
    resize.observe(el);
    el.style.height = `${el.clientWidth / (expanded ? 0.7 : 2)}px`;
    return () => resize.disconnect();
  }, [expanded]);
  const collection =
    app.activeCollection &&
    (app.creatorOrigin === "custom_list" || app.creatorOrigin === "visit_path")
      ? app.activeCollection
      : undefined;
  const saved = collection
    ? collection.ids.includes(c.id)
    : app.favorites.has(c.id);
  const catalog = safeURL(c.catalogUrl);
  return (
    <>
      <div className="detail-actions">
        <div
          className="detail-action-group"
          role="group"
          aria-label="Creator actions"
        >
          <button
            className={`icon-button ${saved ? "is-favorite" : ""}`}
            aria-label={
              collection
                ? saved
                  ? "Remove from collection"
                  : "Restore to collection"
                : saved
                  ? "Remove from favorites"
                  : "Add to favorites"
            }
            aria-pressed={saved}
            onClick={() =>
              collection
                ? app.toggleCollectionCreator(c.id)
                : app.toggleFavorite(c.id)
            }
          >
            {collection ? (
              <Bookmark fill={saved ? "currentColor" : "none"} size={22} />
            ) : (
              <Heart fill={saved ? "currentColor" : "none"} size={22} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Add to collection"
            onClick={() => setCollectionPicker(true)}
          >
            <FolderPlus size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="Share creator"
            onClick={() => app.shareCreator(c)}
          >
            <Share2 size={21} />
          </button>
        </div>
        <button
          className="icon-button detail-close"
          aria-label="Close creator details"
          onClick={app.close}
        >
          <X size={22} />
        </button>
      </div>
      <div className="sheet-scroll detail-scroll">
        <div className="detail-content">
          <div className="profile-card">
            <div
              ref={cut}
              className={`circle-cut ${expanded ? "expanded" : ""}`}
            >
              <Artwork key={c.id} creator={c} />
              <button
                className="icon-button artwork-toggle"
                aria-label={
                  expanded ? "Collapse Circle Cut" : "Expand Circle Cut"
                }
                aria-expanded={expanded}
                onClick={() => {
                  analytics.emit("creator_action", {
                    creator_id: c.id,
                    action: "circle_cut",
                    success: true,
                    expanded: !expanded,
                    origin: app.creatorOrigin,
                  });
                  setExpanded(!expanded);
                  if (!expanded) app.setDetailExtent(0.94);
                }}
              >
                {expanded ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
            <div className="profile-title">
              <span className="kicker">Circle profile</span>
              <h1>{c.name}</h1>
              <div className="wrap">
                {catalog && (
                  <a
                    className="action yellow"
                    href={catalog}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      app.interaction(c.id, "catalog");
                      launchForAnalytics(
                        catalog,
                        "catalog",
                        c.id,
                        app.creatorOrigin,
                      );
                    }}
                  >
                    <ExternalLink size={17} />
                    Circle Page
                  </a>
                )}
                {c.assets.gallery.length > 0 && (
                  <button
                    className="action cyan"
                    onClick={() => app.openGallery(c)}
                  >
                    <Images size={17} />
                    Catalog
                  </button>
                )}
              </div>
            </div>
          </div>
          {c.day && (
            <p
              className={`attendance ${c.attendanceDates.length > 1 ? "both" : c.day === "Sat" ? "sat" : "sun"}`}
            >
              <CalendarDays size={20} />
              {c.day}
            </p>
          )}
          {c.links.length > 0 && (
            <section className="detail-section">
              <h2 className="kicker">Creator links</h2>
              <div className="wrap">
                {c.links.map(
                  (link, i) =>
                    safeURL(link.url) && (
                      <a
                        key={i}
                        className="tag cyan-tint"
                        href={safeURL(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          app.interaction(c.id, "link");
                          launchForAnalytics(
                            link.url,
                            "external_link",
                            c.id,
                            app.creatorOrigin,
                          );
                        }}
                      >
                        <Link size={14} />
                        {label(link.type) || "Website"}
                      </a>
                    ),
                )}
              </div>
            </section>
          )}
          {c.fandoms.length > 0 && (
            <section className="detail-section">
              <h2 className="kicker pink-marker">
                Fandom{c.fandoms.length > 1 ? "s" : ""}
              </h2>
              <div className="wrap">
                {c.fandoms.map((f) => (
                  <button
                    key={f.id}
                    className="tag pink-tint"
                    onClick={() =>
                      app.searchFandom(f.id, { source: "creator_fandom_chip" })
                    }
                  >
                    <Heart size={13} />
                    {f.name}
                  </button>
                ))}
              </div>
            </section>
          )}
          {c.offerings.length > 0 && (
            <section className="detail-section">
              <h2 className="kicker violet-marker">
                Works type{c.offerings.length > 1 ? "s" : ""}
              </h2>
              <div className="wrap">
                {c.offerings.map((o, i) => (
                  <span key={i} className="tag violet-tint">
                    {label(o)}
                  </span>
                ))}
              </div>
            </section>
          )}
          <section className="detail-section">
            <h2 className="kicker yellow-marker">
              Booth location{c.booths.length > 1 ? "s" : ""}
            </h2>
            <div className="wrap">
              {c.booths.map((b) => (
                <span key={b} className="tag yellow">
                  <MapPin size={14} />
                  {b}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
      {collectionPicker && (
        <CollectionPicker
          app={app}
          creatorIds={[c.id]}
          onClose={() => setCollectionPicker(false)}
        />
      )}
    </>
  );
}
const label = (s: string) =>
  s
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

import { useEffect, useState } from "react";
import { Search, X, Heart } from "lucide-react";
import { BoothListSheet } from "./components/BoothListSheet";
import { useApp } from "./state/useApp";
import { MapView } from "./components/MapView";
import { ResponsivePanel } from "./components/ResponsivePanel";
import { Directory } from "./components/Directory";
import { CreatorDetail } from "./components/CreatorDetail";
import { BoothSelector } from "./components/BoothSelector";
import { Gallery } from "./components/Gallery";
import { Updates } from "./components/Updates";
import { FandomSuggestions } from "./components/FandomSuggestions";
import { analytics } from "./data/analytics";
export default function App() {
  const app = useApp();
  const listOpen = !!app.boothList && !app.showDetail;
  const [listExtent, setListExtent] = useState(0.56);
  const closeBoothList = () => {
    app.closeBoothList();
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(".favorites-tag")
        ?.focus({ preventScroll: true }),
    );
  };
  useEffect(() => {
    setListExtent(0.56);
  }, [app.boothList]);
  const [mobile, setMobile] = useState(matchMedia("(max-width:768px)").matches);
  useEffect(() => {
    const activity = () => analytics.activity();
    window.addEventListener("wheel", activity, { passive: true });
    window.addEventListener("touchmove", activity, { passive: true });
    return () => {
      window.removeEventListener("wheel", activity);
      window.removeEventListener("touchmove", activity);
    };
  }, []);
  useEffect(() => {
    const mq = matchMedia("(max-width:768px)");
    const change = () => setMobile(mq.matches);
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const viewport = visualViewport;
    const resize = () => {
      // Browser pinch zoom magnifies the existing layout; it must not be treated
      // as a keyboard resize that shrinks and reflows the app under the fingers.
      if (viewport && viewport.scale !== 1) return;
      // This app has no document-level scrolling. Safari can still scroll the
      // document to reveal an input during keyboard animation; restore only that
      // outer scroll, leaving all native content scrollers and pinch zoom alone.
      if (window.scrollX !== 0 || window.scrollY !== 0)
        window.scrollTo({ left: 0, top: 0, behavior: "instant" });
      const height = viewport?.height || innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      // Keyboard focus can pan the visual viewport independently of resizing it.
      // Keep the fixed app inside that visible rectangle; do not scroll the page.
      document.documentElement.style.setProperty(
        "--app-top",
        `${Math.max(0, Math.min(viewport?.offsetTop || 0, innerHeight - height))}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, { passive: true });
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !app.gallery &&
        !app.selector &&
        !document.querySelector("dialog[open]")
      ) {
        if (listOpen) closeBoothList();
        else if (app.showDetail) app.close();
        else app.setSearchExtent(0.2);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [app.showDetail, app.gallery, app.selector, listOpen]);
  if (app.error)
    return (
      <div className="loading">
        <h1>Could not load CF23 Map</h1>
        <p>{app.error}</p>
        <button className="action cyan" onClick={app.retry}>
          Retry
        </button>
      </div>
    );
  if (!app.snapshot || !app.catalog)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Loading CF23 Map…
      </div>
    );
  const detail = app.selected && app.showDetail;
  const searchHeader = (
    <header className="search-header" data-drag>
      <div className="desktop-kicker kicker">CF23 creator directory</div>
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          app.submitSearch();
          if (!app.applyLink(app.query))
            (document.activeElement as HTMLElement)?.blur();
        }}
      >
        <Search className="search-icon" size={22} />
        <input
          aria-label="Search name, booth, or fandom"
          placeholder="Search name, booth, or fandom..."
          value={app.query}
          onFocus={app.openSearch}
          onChange={(e) => app.search(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        {(app.query || app.selected) && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={app.clearSearch}
          >
            <X size={19} />
          </button>
        )}
      </form>
      <FandomSuggestions
        fandoms={app.suggestions}
        onSelect={app.searchFandom}
        leading={
          !app.query.trim() &&
          app.fandomId === undefined &&
          app.favoriteCreators.length > 0 ? (
            <button
              type="button"
              className="tag pink-tint favorites-tag"
              aria-label="Favorites"
              onClick={() => {
                setListExtent(0.56);
                app.openFavorites();
              }}
            >
              <Heart size={14} fill="currentColor" /> Favorites{" "}
              <span>{app.favoriteCreators.length}</span>
            </button>
          ) : undefined
        }
      />
    </header>
  );
  return (
    <>
      <div className={`app-shell ${detail ? "showing-detail" : ""}`}>
        <MapView app={app} />
        <div className="directory-region">
          <ResponsivePanel
            mobile={mobile}
            kind="search"
            visible={!detail && !listOpen}
            extent={app.searchExtent}
            onExtent={app.setSearchExtent}
          >
            {searchHeader}
            <Directory app={app} />
          </ResponsivePanel>
          <ResponsivePanel
            mobile={mobile}
            kind="detail"
            visible={!!detail}
            extent={app.detailExtent}
            onExtent={app.setDetailExtent}
          >
            {detail && <CreatorDetail key={app.selected!.id} app={app} />}
          </ResponsivePanel>
          <ResponsivePanel
            mobile={mobile}
            kind="list"
            label={app.favoritesMode ? "Favorites" : "Booth list"}
            visible={listOpen}
            extent={listExtent}
            onExtent={setListExtent}
          >
            {listOpen && <BoothListSheet app={app} onClose={closeBoothList} />}
          </ResponsivePanel>
        </div>
        <Updates />
      </div>
      <div
        className={`toast ${app.toast ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {app.toast}
      </div>
      {app.gallery && (
        <Gallery creator={app.gallery} onClose={() => app.setGallery(null)} />
      )}
      {app.selector && (
        <BoothSelector
          booth={app.selector.booth}
          creators={app.selector.creators}
          onSelect={(c) => app.select(c, true, "map")}
          onGallery={(creator) => {
            app.setSelector(null);
            app.openGallery(creator);
          }}
          onClose={() => app.setSelector(null)}
        />
      )}
    </>
  );
}

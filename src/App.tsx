import { useEffect, useState } from "react";
import { Search, X, ArrowLeft } from "lucide-react";
import { useApp } from "./state/useApp";
import { MapView } from "./components/MapView";
import { Sheet } from "./components/Sheet";
import { Directory } from "./components/Directory";
import { CreatorDetail } from "./components/CreatorDetail";
import { BoothSelector } from "./components/BoothSelector";
import { Gallery } from "./components/Gallery";
import { Updates } from "./components/Updates";
import { Presence } from "./components/Presence";
import { FandomSuggestions } from "./components/FandomSuggestions";
import { analytics } from "./data/analytics";
export default function App() {
  const app = useApp();
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
      if (e.key === "Escape" && !app.gallery && !app.selector) {
        if (app.showDetail) app.close();
        else app.setSearchExtent(0.2);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [app.showDetail, app.gallery, app.selector]);
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
        {app.selected && !mobile ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Back to directory"
            onClick={() => (app.showDetail ? app.close() : app.resumeDetail())}
          >
            <ArrowLeft size={21} />
          </button>
        ) : (
          <Search className="search-icon" size={22} />
        )}
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
      {(!detail || mobile) && (
        <FandomSuggestions
          fandoms={app.suggestions}
          onSelect={app.searchFandom}
        />
      )}
    </header>
  );
  return (
    <>
      <div className={`app-shell ${detail ? "showing-detail" : ""}`}>
        <MapView app={app} />
        <div className="directory-region">
          {mobile ? (
            <>
              <Sheet
                kind="search"
                extent={app.searchExtent}
                onExtent={app.setSearchExtent}
                hidden={!!detail}
              >
                {searchHeader}
                <Directory app={app} />
              </Sheet>
              <Presence visible={!!detail} className="detail-presence">
                {detail && (
                  <Sheet
                    kind="detail"
                    extent={app.detailExtent}
                    onExtent={app.setDetailExtent}
                  >
                    <CreatorDetail key={app.selected!.id} app={app} />
                  </Sheet>
                )}
              </Presence>
            </>
          ) : (
            <>
              {searchHeader}
              <div className="desktop-directory" hidden={!!detail}>
                <Directory app={app} />
              </div>
              {detail && (
                <div className="desktop-detail">
                  <CreatorDetail key={app.selected!.id} app={app} />
                </div>
              )}
            </>
          )}
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

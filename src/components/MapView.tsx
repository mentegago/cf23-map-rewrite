import { useEffect, useMemo, useRef } from "react";
import { Plus, Minus, Expand, Sparkles, Code2 } from "lucide-react";
import type { AppModel } from "../state/useApp";
import { MapController } from "../map/MapController";
import { boothKey } from "../domain/search";
import { analytics } from "../data/analytics";
import { useMapCreators } from "../state/useMapCreators";
import { APP_VERSION } from "../appVersion";
import { launchForAnalytics } from "../data/analyticsActions";
export function MapView({ app }: { app: AppModel }) {
  const mapCreators = useMapCreators(app);
  const visibleIds = useMemo(
    () => new Set(mapCreators.map((c) => c.id)),
    [mapCreators],
  );
  const displayedIds = useRef(visibleIds);
  const canvas = useRef<HTMLCanvasElement>(null),
    controller = useRef<MapController | null>(null),
    latest = useRef(app);
  latest.current = app;
  useEffect(() => {
    const map = new MapController(
      canvas.current!,
      latest.current.snapshot!.map,
      (id) => {
        const a = latest.current;
        if (id === null) {
          analytics.emit("booth_selected", { count: 0, outcome: "empty" });
          return;
        }
        const creators =
          a
            .catalog!.byBooth.get(boothKey(id))
            ?.filter((c) => displayedIds.current.has(c.id)) || [];
        analytics.emit("booth_selected", {
          count: creators.length,
          outcome:
            creators.length === 0
              ? "empty"
              : creators.length === 1
                ? "opened"
                : "chooser",
        });
        if (creators.length === 1) a.select(creators[0], true, "map");
        else if (creators.length > 1) a.setSelector({ booth: id, creators });
      },
    );
    controller.current = map;
    return () => map.destroy();
  }, []);
  useEffect(() => {
    displayedIds.current = visibleIds;
    controller.current!.update(
      app.snapshot!.map,
      mapCreators,
      app.selected,
      !!app.custom || app.favoritesMode,
    );
  }, [
    app.snapshot?.map,
    mapCreators,
    visibleIds,
    app.selected,
    app.custom,
    app.favoritesMode,
  ]);
  useEffect(() => {
    if (app.selected) controller.current!.focus(app.selected);
  }, [app.selected?.id]);
  return (
    <div className="map-region">
      <canvas
        ref={canvas}
        className="map-canvas"
        tabIndex={0}
        aria-label="Interactive CF23 booth map. Drag to pan, pinch or scroll to zoom. Keyboard: arrow keys to pan, plus and minus to zoom, zero for overview. Use the directory to select creators."
      />
      <div className="map-tools">
        <button
          className="icon-button"
          aria-label="Zoom in map"
          onClick={() => controller.current!.zoom(1.4)}
        >
          <Plus />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out map"
          onClick={() => controller.current!.zoom(1 / 1.4)}
        >
          <Minus />
        </button>
        <button
          className="icon-button"
          aria-label="Show entire map"
          onClick={() => controller.current!.fit()}
        >
          <Expand size={19} />
        </button>
      </div>
      <div className="map-actions">
        <button
          className="action yellow"
          onClick={() => {
            const c =
              mapCreators[Math.floor(Math.random() * mapCreators.length)];
            if (c) app.select(c, true, "random");
          }}
          disabled={!mapCreators.length}
        >
          <Sparkles size={18} />
          Surprise me!
        </button>
        <a
          className="icon-button source-button"
          href="https://github.com/mentegago/cf23-map"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title={`CF23 Map · App version ${APP_VERSION}`}
          onClick={(e) => {
            e.preventDefault();
            launchForAnalytics(e.currentTarget.href, "source_code");
          }}
        >
          <Code2 size={21} />
        </a>
      </div>
      {!app.online && (
        <span className="offline-badge" role="status">
          Offline · saved map
        </span>
      )}
    </div>
  );
}

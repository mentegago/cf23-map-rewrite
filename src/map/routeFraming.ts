import type { MapDocument } from "../domain/types";
import { boothKey } from "../domain/search";
import { boothFront, type VisitRoute } from "./visitRoute";
import type { Transform } from "./geometry";

/** Fit the walking leg and the tables it connects, not just aisle stop points. */
export function routeFrame(
  map: MapDocument,
  route: VisitRoute,
  leg: number,
  width: number,
  height: number,
  mobile: boolean,
  leftInset = 0,
  safeBottom = 0,
): Transform | null {
  const points = [...(route.legs[leg] || route.points)];
  if (!points.length) return null;
  const stops =
    leg < 0 ? route.stops : route.stops.slice(Math.max(0, leg - 1), leg + 1);
  const ids = new Set(stops.flatMap((s) => s.booths.map(boothKey)));
  const markers = map.features.filter(
    (f) => f.type === "booth-suffix-marker" && f.status !== "suggestion",
  );
  for (const f of map.features) {
    if (
      f.kind !== "booth" ||
      f.status === "suggestion" ||
      !ids.has(boothKey(f.id || ""))
    )
      continue;
    const g = f.geometry,
      front = boothFront(f, markers);
    points.push(
      {
        x: front?.side === "left" ? front.edge : g.x,
        y: front?.side === "top" ? front.edge : g.y,
      },
      {
        x: front?.side === "right" ? front.edge : g.x + g.width,
        y: front?.side === "bottom" ? front.edge : g.y + g.height,
      },
    );
  }
  const left = Math.min(...points.map((p) => p.x)),
    right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y)),
    bottom = Math.max(...points.map((p) => p.y));
  // Leave room for stop circles, the zoom controls and the collapsed route sheet.
  const viewLeft = leftInset + 32,
    viewRight = width - 80,
    viewTop = 40;
  const viewBottom = mobile ? height - 200 - safeBottom : height - 32;
  const availableWidth = Math.max(1, viewRight - viewLeft),
    availableHeight = Math.max(1, viewBottom - viewTop);
  const scale = Math.min(
    2,
    availableWidth / Math.max(80, right - left),
    availableHeight / Math.max(80, bottom - top),
  );
  return {
    scale,
    x: viewLeft + availableWidth / 2 - ((left + right) / 2) * scale,
    y: viewTop + availableHeight / 2 - ((top + bottom) / 2) * scale,
  };
}

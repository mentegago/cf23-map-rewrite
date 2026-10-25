import type { VisitRoute, RoutePoint } from "./visitRoute";

/** Static direction cues: no animation loop or motion required to read a route. */
export function paintVisitRoute(
  ctx: CanvasRenderingContext2D,
  route: VisitRoute,
  legIndex: number,
  scale: number,
  dark: boolean,
) {
  if (!route.points.length) return;
  const ink = dark ? "#fff6e8" : "#191522",
    paper = dark ? "#15111e" : "#fff8ed";
  const active = route.legs[legIndex];
  const stroke = (points: RoutePoint[], color: string, width: number) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = width / scale;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = active ? 0.28 : 0.7;
  ctx.setLineDash([4 / scale, 5 / scale]);
  stroke(route.points, dark ? "#b8acbf" : "#70697a", 2);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (active) {
    stroke(active, paper, 8);
    stroke(active, "#00b8ca", 4);
    // Chevron spacing is in screen pixels so zooming doesn't crowd the path.
    for (let i = 1; i < active.length; i++) {
      const a = active[i - 1],
        b = active[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y),
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (
        let distance = 25 / scale;
        distance < length - 12 / scale;
        distance += 65 / scale
      ) {
        ctx.save();
        ctx.translate(
          a.x + Math.cos(angle) * distance,
          a.y + Math.sin(angle) * distance,
        );
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-4 / scale, -4 / scale);
        ctx.lineTo(1 / scale, 0);
        ctx.lineTo(-4 / scale, 4 / scale);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6 / scale;
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  const markers = [
    { point: route.points[0], label: "S", index: -1 },
    ...route.stops.map((s, i) => ({
      point: s.point,
      label: String(i + 1),
      index: i,
    })),
  ];
  // Reserve room for this leg's endpoints before placing other stop labels.
  markers.sort(
    (a, b) =>
      Number(b.index === legIndex || b.index === legIndex - 1) -
      Number(a.index === legIndex || a.index === legIndex - 1),
  );
  const placed: RoutePoint[] = [];
  for (const marker of markers) {
    const { point, label, index } = marker;
    const destination = !!active && index === legIndex;
    const origin = !!active && index === legIndex - 1;
    const emphasized = destination || origin || !active;
    if (
      !destination &&
      placed.some((p) => Math.hypot(p.x - point.x, p.y - point.y) * scale < 27)
    )
      continue;
    placed.push(point);
    const radius = destination ? 13 : 9;
    ctx.globalAlpha = emphasized ? 1 : 0.48;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius / scale, 0, Math.PI * 2);
    ctx.fillStyle = destination ? "#ffdc60" : paper;
    ctx.fill();
    ctx.strokeStyle = destination ? "#191522" : origin ? "#00b8ca" : ink;
    ctx.lineWidth = (emphasized ? 2 : 1) / scale;
    ctx.stroke();
    ctx.fillStyle = destination ? "#191522" : ink;
    ctx.font = `700 ${(destination ? 12 : 10) / scale}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, point.x, point.y);
  }
  ctx.restore();
}

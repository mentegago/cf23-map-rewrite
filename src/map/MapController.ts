import type { Creator, MapDocument } from "../domain/types";
import { boothKey } from "../domain/search";
import {
  clamp,
  focusTransform,
  referenceSize,
  SpatialIndex,
  zoomAt,
  type Transform,
} from "./geometry";
import { paint, type PaintState } from "./paint";
/** Owns high-frequency gestures/rendering independently of React state. */
export class MapController {
  private pendingFocus: Creator | null = null;
  private ctx: CanvasRenderingContext2D;
  private state: PaintState;
  private index: SpatialIndex;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private frame = 0;
  private animation = 0;
  private resize: ResizeObserver;
  private abort = new AbortController();
  private points = new Map<number, { x: number; y: number }>();
  private moved = false;
  private down = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private lastTime = 0;
  private lastTap = 0;
  constructor(
    private canvas: HTMLCanvasElement,
    map: MapDocument,
    private onBooth: (id: string) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.index = new SpatialIndex(map.features);
    this.state = {
      map,
      transform: { x: 0, y: 0, scale: 1 },
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
      activeBooths: new Set(),
      selected: new Set(),
      curated: false,
      reference: referenceSize(map),
    };
    const signal = this.abort.signal;
    canvas.addEventListener("pointerdown", this.pointerDown, { signal });
    canvas.addEventListener("pointermove", this.pointerMove, { signal });
    canvas.addEventListener("pointerup", this.pointerUp, { signal });
    canvas.addEventListener("pointercancel", this.pointerCancel, { signal });
    canvas.addEventListener(
      "pointerleave",
      () => {
        this.state.hover = undefined;
        this.draw();
      },
      { signal },
    );
    canvas.addEventListener("wheel", this.wheel, { signal, passive: false });
    canvas.addEventListener("keydown", this.key, { signal });
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      (e) => {
        this.state.dark = e.matches;
        this.draw();
      },
      { signal },
    );
    this.resize = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      const oldW = this.width,
        oldH = this.height;
      this.width = r.width;
      this.height = r.height;
      this.dpr = Math.min(devicePixelRatio || 1, 3);
      canvas.width = Math.round(r.width * this.dpr);
      canvas.height = Math.round(r.height * this.dpr);
      if (oldW === 1) this.reset(false);
      else {
        this.state.transform.x += (this.width - oldW) / 2;
        this.state.transform.y += (this.height - oldH) / 2;
      }
      this.draw();
      if (this.pendingFocus) {
        const c = this.pendingFocus;
        this.pendingFocus = null;
        this.focus(c);
      }
    });
    this.resize.observe(canvas);
    document.fonts.ready.then(() => this.draw());
  }
  update(
    map: MapDocument,
    creators: Creator[],
    selected: Creator | null,
    curated: boolean,
  ) {
    if (map !== this.state.map) {
      this.state.map = map;
      this.index = new SpatialIndex(map.features);
      this.state.reference = referenceSize(map);
      this.state.hover = undefined;
    }
    this.state.activeBooths = new Set(
      creators.flatMap((c) => c.booths.map(boothKey)),
    );
    this.state.selected = new Set(selected?.booths.map(boothKey) || []);
    this.state.curated = curated;
    this.draw();
  }
  focus(creator: Creator) {
    if (this.width <= 1) {
      this.pendingFocus = creator;
      return;
    }
    const ids = new Set(creator.booths.map(boothKey));
    const features = this.state.map.features.filter(
      (f) =>
        f.status !== "suggestion" &&
        f.kind === "booth" &&
        ids.has(boothKey(f.id || "")),
    );
    const t = focusTransform(
      features,
      this.width,
      this.height,
      this.state.reference,
      matchMedia("(max-width:768px)").matches,
    );
    if (t) this.animate(t, 700);
  }
  reset(animate = true) {
    const scale = clamp(20 / this.state.reference, 0.2, 1.5);
    const t = {
      scale,
      x: (this.width - this.state.map.bounds.width * scale) / 2,
      y: (this.height - this.state.map.bounds.height * scale) / 2,
    };
    if (animate) this.animate(t);
    else this.state.transform = t;
    this.draw();
  }
  fit() {
    const scale =
      Math.min(
        this.width / this.state.map.bounds.width,
        (this.height *
          (matchMedia("(max-width:768px)").matches ? 0.75 : 0.94)) /
          this.state.map.bounds.height,
      ) * 0.95;
    this.animate({
      scale,
      x: (this.width - this.state.map.bounds.width * scale) / 2,
      y: (this.height * 0.85 - this.state.map.bounds.height * scale) / 2,
    });
  }
  zoom(factor: number) {
    this.animate(
      zoomAt(this.state.transform, this.width / 2, this.height / 2, factor),
      200,
    );
  }
  private draw() {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        paint(this.ctx, this.width, this.height, this.dpr, this.state);
      });
  }
  private stop() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
  }
  private animate(target: Transform, duration = 400) {
    this.stop();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.state.transform = target;
      this.draw();
      return;
    }
    const start = { ...this.state.transform },
      time = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - time) / duration),
        ease = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      this.state.transform = {
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
        scale: start.scale + (target.scale - start.scale) * ease,
      };
      this.draw();
      if (p < 1) this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
  private local(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private constrain() {
    const t = this.state.transform,
      margin = 180;
    t.x = clamp(
      t.x,
      -this.state.map.bounds.width * t.scale + margin,
      this.width - margin,
    );
    t.y = clamp(
      t.y,
      -this.state.map.bounds.height * t.scale + margin,
      this.height - margin,
    );
  }
  private pointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.stop();
    const p = this.local(e);
    this.points.set(e.pointerId, p);
    this.canvas.setPointerCapture(e.pointerId);
    this.down = p;
    this.velocity = { x: 0, y: 0 };
    this.lastTime = e.timeStamp;
    if (this.points.size === 1) this.moved = false;
    else this.moved = true;
    this.canvas.style.cursor = "grabbing";
  };
  private pointerMove = (e: PointerEvent) => {
    const p = this.local(e),
      old = this.points.get(e.pointerId);
    if (!old) {
      if (e.pointerType !== "touch") {
        const t = this.state.transform;
        this.state.hover = this.index.hit(
          (p.x - t.x) / t.scale,
          (p.y - t.y) / t.scale,
        );
        this.canvas.style.cursor = this.state.hover ? "pointer" : "grab";
        this.canvas.title = this.state.hover?.id || "";
        this.draw();
      }
      return;
    }
    if (Math.hypot(p.x - this.down.x, p.y - this.down.y) > 6) this.moved = true;
    if (this.points.size === 2) {
      const other = [...this.points].find(([id]) => id !== e.pointerId)![1],
        oldCenter = { x: (old.x + other.x) / 2, y: (old.y + other.y) / 2 },
        center = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      const ratio =
        Math.hypot(p.x - other.x, p.y - other.y) /
        Math.max(1, Math.hypot(old.x - other.x, old.y - other.y));
      this.state.transform = zoomAt(
        this.state.transform,
        oldCenter.x,
        oldCenter.y,
        ratio,
      );
      this.state.transform.x += center.x - oldCenter.x;
      this.state.transform.y += center.y - oldCenter.y;
      this.moved = true;
    } else if (this.points.size === 1) {
      const dx = p.x - old.x,
        dy = p.y - old.y,
        dt = Math.max(1, e.timeStamp - this.lastTime);
      this.state.transform.x += dx;
      this.state.transform.y += dy;
      this.velocity = { x: dx / dt, y: dy / dt };
    }
    this.lastTime = e.timeStamp;
    this.points.set(e.pointerId, p);
    this.constrain();
    this.draw();
  };
  private pointerUp = (e: PointerEvent) => {
    if (!this.points.has(e.pointerId)) return;
    const p = this.local(e);
    this.points.delete(e.pointerId);
    if (this.points.size) {
      this.moved = true;
      this.velocity = { x: 0, y: 0 };
      return;
    }
    this.canvas.style.cursor = "grab";
    if (!this.moved) {
      const t = this.state.transform,
        hit = this.index.hit((p.x - t.x) / t.scale, (p.y - t.y) / t.scale);
      if (hit?.id) this.onBooth(hit.id);
      else if (e.timeStamp - this.lastTap < 300)
        this.animate(zoomAt(t, p.x, p.y, 1.7), 250);
      this.lastTap = e.timeStamp;
    } else if (e.timeStamp - this.lastTime < 80) {
      const v = { ...this.velocity };
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(32, now - last);
        last = now;
        v.x *= Math.exp(-dt / 170);
        v.y *= Math.exp(-dt / 170);
        this.state.transform.x += v.x * dt;
        this.state.transform.y += v.y * dt;
        this.constrain();
        this.draw();
        if (Math.hypot(v.x, v.y) > 0.02)
          this.animation = requestAnimationFrame(tick);
      };
      this.animation = requestAnimationFrame(tick);
    }
  };
  private pointerCancel = (e: PointerEvent) => {
    this.points.delete(e.pointerId);
    this.moved = true;
    this.velocity = { x: 0, y: 0 };
    this.canvas.style.cursor = "grab";
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.stop();
    const p = this.local(e);
    this.state.transform = zoomAt(
      this.state.transform,
      p.x,
      p.y,
      Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)),
    );
    this.constrain();
    this.draw();
  };
  private key = (e: KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      this.zoom(1.4);
    } else if (e.key === "-") {
      e.preventDefault();
      this.zoom(1 / 1.4);
    } else if (e.key === "0") {
      e.preventDefault();
      this.fit();
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      this.stop();
      this.state.transform.x +=
        e.key === "ArrowLeft" ? 60 : e.key === "ArrowRight" ? -60 : 0;
      this.state.transform.y +=
        e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0;
      this.constrain();
      this.draw();
    }
  };
  destroy() {
    this.abort.abort();
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    this.stop();
  }
}

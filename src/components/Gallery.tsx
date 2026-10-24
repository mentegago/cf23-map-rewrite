import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type { Creator } from "../domain/types";
import { safeURL } from "../domain/links";
import { clamp } from "../map/geometry";
import { analytics } from "../data/analytics";
import { LoadingImage } from "./LoadingImage";

export function Gallery({
  creator,
  onClose,
}: {
  creator: Creator;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const currentIndex = useRef(0);
  const hasChanged = useRef(false);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [closing, setClosing] = useState(false);
  const [preloadIndex, setPreloadIndex] = useState(0);
  const total = creator.assets.gallery.length;
  const advancePreload = (page: number) =>
    setPreloadIndex((n) => (n === page ? Math.min(n + 1, total - 1) : n));
  useEffect(() => {
    if (!safeURL(creator.assets.gallery[preloadIndex]))
      advancePreload(preloadIndex);
  }, [preloadIndex, creator.assets.gallery]);
  const close = () => setClosing(true);
  const goTo = (page: number) => {
    setScale(1);
    stage.current?.scrollTo({
      left: clamp(page, 0, total - 1) * stage.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  useEffect(() => {
    const before = document.activeElement;
    dialog.current!.showModal();
    const resize = new ResizeObserver(() => {
      const el = stage.current;
      if (!el) return;
      el.scrollTo({
        left: currentIndex.current * el.clientWidth,
        behavior: "instant",
      });
    });
    resize.observe(stage.current!);
    return () => {
      resize.disconnect();
      if (before instanceof HTMLElement) before.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(
      onClose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  useEffect(() => {
    setScale(1);
    if (index === 0 && !hasChanged.current) return;
    hasChanged.current = true;
    analytics.emit("gallery_action", {
      creator_id: creator.id,
      action: "image_changed",
      index,
    });
  }, [index]);
  return (
    <dialog
      ref={dialog}
      className={`gallery-dialog ${closing ? "closing" : ""}`}
      aria-label={`${creator.name} catalog`}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          goTo(index + (e.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <header>
        <div>
          <strong>{creator.name}</strong>
          <span>
            {index + 1} / {total}
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={scale === 1}
          onClick={() => setScale((s) => clamp(s / 1.5, 1, 5))}
        >
          <ZoomOut />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={scale === 5}
          onClick={() => setScale((s) => clamp(s * 1.5, 1, 5))}
        >
          <ZoomIn />
        </button>
        <button
          className="icon-button"
          aria-label="Close gallery"
          onClick={close}
        >
          <X />
        </button>
      </header>
      <div
        ref={stage}
        className={`gallery-stage ${scale > 1 ? "zoomed" : ""}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const page = clamp(
            Math.round(el.scrollLeft / el.clientWidth),
            0,
            total - 1,
          );
          if (page !== currentIndex.current) {
            currentIndex.current = page;
            setIndex(page);
          }
        }}
      >
        {creator.assets.gallery.map((url, page) => (
          <div className="gallery-page" key={page} aria-hidden={page !== index}>
            <GalleryImage
              src={page <= preloadIndex ? safeURL(url) : undefined}
              alt={`${creator.name} catalog page ${page + 1}`}
              scale={page === index ? scale : 1}
              onToggleZoom={() => setScale((s) => (s > 1 ? 1 : 2))}
              onScale={setScale}
              onSettled={() => advancePreload(page)}
            />
          </div>
        ))}
      </div>
      <footer>
        <button
          className="icon-button"
          aria-label="Previous image"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft />
        </button>
        <nav className="gallery-pagination" aria-label="Catalog pages">
          {creator.assets.gallery.map((_, page) => (
            <button
              key={page}
              type="button"
              aria-label={`Go to page ${page + 1}`}
              aria-current={page === index ? "page" : undefined}
              onClick={() => goTo(page)}
            >
              <span />
            </button>
          ))}
        </nav>
        <button
          className="icon-button"
          aria-label="Next image"
          disabled={index === total - 1}
          onClick={() => goTo(index + 1)}
        >
          <ChevronRight />
        </button>
      </footer>
    </dialog>
  );
}

function GalleryImage({
  src,
  alt,
  scale,
  onToggleZoom,
  onScale,
  onSettled,
}: {
  src: string | undefined;
  alt: string;
  scale: number;
  onToggleZoom: () => void;
  onScale: (scale: number) => void;
  onSettled: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousScale = useRef(1);
  const currentScale = useRef(scale);
  currentScale.current = scale;
  const scaleCallback = useRef(onScale);
  scaleCallback.current = onScale;
  const anchor = useRef<{
    x: number;
    y: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  useLayoutEffect(() => {
    const el = viewport.current!;
    const ratio = scale / previousScale.current;
    el.scrollTo({
      left: anchor.current
        ? anchor.current.x * scale - anchor.current.screenX
        : (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2,
      top: anchor.current
        ? anchor.current.y * scale - anchor.current.screenY
        : (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2,
      behavior: "instant",
    });
    previousScale.current = scale;
  }, [scale]);
  useEffect(() => {
    const el = viewport.current!;
    let pinch: {
      distance: number;
      scale: number;
      x: number;
      y: number;
    } | null = null;
    let consumed = false;
    const distance = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = Array.from(e.touches);
      const rect = el.getBoundingClientRect();
      const s = currentScale.current;
      pinch = {
        distance: Math.max(1, distance(a, b)),
        scale: s,
        x: (el.scrollLeft + (a.clientX + b.clientX) / 2 - rect.left) / s,
        y: (el.scrollTop + (a.clientY + b.clientY) / 2 - rect.top) / s,
      };
      consumed = true;
    };
    const move = (e: TouchEvent) => {
      if (!consumed) return; // One-finger paging and panning remain native.
      if (e.cancelable) e.preventDefault();
      if (!pinch || e.touches.length !== 2) return;
      const [a, b] = Array.from(e.touches);
      const rect = el.getBoundingClientRect();
      anchor.current = {
        x: pinch.x,
        y: pinch.y,
        screenX: (a.clientX + b.clientX) / 2 - rect.left,
        screenY: (a.clientY + b.clientY) / 2 - rect.top,
      };
      scaleCallback.current(
        clamp((pinch.scale * distance(a, b)) / pinch.distance, 1, 5),
      );
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0 || e.type === "touchcancel") {
        consumed = false;
        anchor.current = null;
      }
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);
  return (
    <div
      className="gallery-image-viewport"
      ref={viewport}
      onDoubleClick={onToggleZoom}
    >
      <div
        className="gallery-image-content"
        style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      >
        {failed ? (
          <p>
            Image unavailable offline or could not be loaded.
            <br />
            <button className="action" onClick={() => setFailed(false)}>
              Retry image
            </button>
          </p>
        ) : (
          <LoadingImage
            src={src}
            alt={alt}
            onReady={onSettled}
            onError={() => {
              setFailed(true);
              onSettled();
            }}
          />
        )}
      </div>
    </div>
  );
}

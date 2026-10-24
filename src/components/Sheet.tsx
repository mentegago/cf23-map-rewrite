import { useLayoutEffect, useRef, type ReactNode } from "react";
import { clamp } from "../map/geometry";
import { analytics } from "../data/analytics";
export const searchCollapsed = (height: number, safe = 0) =>
  clamp((132 + safe) / height, 0.16, 0.24);
export function snapExtent(
  extent: number,
  velocity: number,
  detents: number[],
) {
  if (velocity < -500)
    return detents.find((d) => d > extent + 0.03) ?? detents.at(-1)!;
  if (velocity > 500)
    return [...detents].reverse().find((d) => d < extent - 0.03) ?? detents[0];
  return detents.reduce((a, b) =>
    Math.abs(a - extent) < Math.abs(b - extent) ? a : b,
  );
}
export function Sheet({
  kind,
  extent,
  onExtent,
  children,
  hidden = false,
}: {
  kind: "search" | "detail" | "favorites";
  extent: number;
  onExtent: (n: number) => void;
  children: ReactNode;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLElement>(null),
    callback = useRef(onExtent);
  callback.current = onExtent;
  const reported = useRef<string | null>(null);
  const report = (value: number, source: "gesture" | "programmatic") => {
    const state =
      value < 0.3
        ? "collapsed"
        : value < 0.9
          ? "partiallyExpanded"
          : "expanded";
    if (reported.current === state) return;
    reported.current = state;
    if (kind !== "favorites")
      analytics.emit("sheet_state_changed", { state, sheet: kind, source });
    if (kind === "search" && state === "collapsed")
      analytics.emit("search_closed", { reason: "dismissed" });
  };
  useLayoutEffect(() => {
    if (!hidden) report(extent, "programmatic");
  }, [extent, hidden]);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.style.setProperty("--extent", String(extent));
  }, [extent]);
  useLayoutEffect(() => {
    const el = ref.current!;
    let startX = 0,
      startY = 0,
      lastY = 0,
      lastT = 0,
      velocity = 0,
      dragging = false,
      eligible = false,
      inputOrigin: HTMLInputElement | null = null,
      startT = 0,
      pointer = 0,
      suppressClick = false;
    const height = () => document.getElementById("app")!.clientHeight;
    const resize = new ResizeObserver(() => {
      el.style.setProperty("--collapsed-extent", String(min()));
      if (kind === "search" && current() < 0.3) {
        const value = searchCollapsed(
          height(),
          parseFloat(getComputedStyle(el).paddingBottom) || 0,
        );
        if (Math.abs(value - current()) > 0.001) {
          el.style.setProperty("--extent", String(value));
          callback.current(value);
        }
      }
    });
    const min = () =>
      kind !== "search"
        ? 0.28
        : searchCollapsed(
            height(),
            parseFloat(
              getComputedStyle(el).getPropertyValue("--safe-bottom"),
            ) || 0,
          );
    const current = () =>
      Number(el.style.getPropertyValue("--extent")) || min();
    const beginDrag = () => {
      const visibleExtent = el.getBoundingClientRect().height / height();
      dragging = true;
      el.classList.add("dragging");
      if (kind !== "search") el.classList.add("scroll-locked");
      el.style.setProperty(
        "--extent",
        String(clamp(visibleExtent, min(), 0.94)),
      );
    };
    const updateDrag = (y: number, time: number) => {
      const delta = y - lastY;
      const sample = (delta / Math.max(1, time - lastT)) * 1000;
      velocity = velocity * 0.6 + sample * 0.4;
      lastY = y;
      lastT = time;
      const after = clamp(current() - delta / height(), min(), 0.94);
      el.style.setProperty("--extent", String(after));
      el.classList.toggle("collapsed", after < 0.3);
    };
    resize.observe(document.getElementById("app")!);
    const down = (e: PointerEvent) => {
      if (
        !matchMedia("(max-width:768px)").matches ||
        e.button !== 0 ||
        !e.isPrimary
      )
        return;
      // A fresh pointer sequence must never inherit the previous drag's click guard,
      // including taps on fixed controls outside the scrolling content.
      suppressClick = false;
      eligible = false;
      const target = e.target as HTMLElement;
      inputOrigin = target.closest<HTMLInputElement>(".search-box input");
      if (inputOrigin) {
        // An unfocused field can resize the sheet without opening the keyboard.
        // Focused editing, mouse selection, and long presses stay browser-owned.
        if (
          kind !== "search" ||
          e.pointerType !== "touch" ||
          document.activeElement === inputOrigin
        )
          return;
      }
      if (
        target.closest(".sheet-scroll,textarea,[contenteditable],a") ||
        (target.closest("input") && !inputOrigin)
      )
        return;
      // Fandom buttons remain normal tap targets, but a deliberate vertical
      // drag on the strip can resize the sheet. Other controls stay native.
      if (
        target.closest("button:not(.grip)") &&
        !target.closest(".suggestions")
      )
        return;
      eligible = !!target.closest("[data-drag]");
      if (!eligible) return;
      startX = e.clientX;
      startY = lastY = e.clientY;
      startT = lastT = e.timeStamp;
      velocity = 0;
      pointer = e.pointerId;
    };
    const move = (e: PointerEvent) => {
      if (!eligible || pointer !== e.pointerId) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (
        !dragging &&
        inputOrigin &&
        (document.activeElement === inputOrigin || e.timeStamp - startT > 350)
      ) {
        eligible = false;
        return;
      }
      if (!dragging && dx > 8 && dx > dy) {
        eligible = false; // Let the browser own horizontal tag scrolling.
        return;
      }
      if (!dragging && dy > 12 && dy > dx * 1.2) {
        // Interrupt an in-progress snap at its visible height, not its target.
        beginDrag();
        el.setPointerCapture(e.pointerId);
      }
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      updateDrag(e.clientY, e.timeStamp);
    };
    const end = (e: PointerEvent) => {
      // Touch starts with implicit capture on the child. Its loss bubbles here
      // when we deliberately transfer capture to the sheet; that is not a cancel.
      if (e.type === "lostpointercapture" && e.target !== el) return;
      if (pointer !== e.pointerId) return;
      pointer = 0;
      eligible = false;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      finishDrag(e.type !== "pointerup", e.timeStamp);
    };
    const finishDrag = (cancelled: boolean, time: number) => {
      if (!dragging) return;
      dragging = false;
      suppressClick = !cancelled;
      el.classList.remove("dragging");
      const speed = !cancelled && time - lastT < 100 ? velocity : 0;
      const target = snapExtent(
        current(),
        speed,
        kind !== "search" ? [0.28, 0.56, 0.94] : [min(), 0.94],
      );
      el.style.setProperty("--extent", String(target));
      el.classList.toggle("scroll-locked", target < 0.9);
      callback.current(target);
      report(target, "gesture");
    };
    // Decide ownership once per touch sequence. Never take over a native scroll
    // that merely reaches the top, and never write scrollTop or simulate momentum.
    let contentTouch: number | null = null;
    let canExpandContent = false;
    let canCollapseContent = false;
    const releaseContent = () => {
      contentTouch = null;
    };
    const contentStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (contentTouch !== null) finishDrag(true, e.timeStamp);
        releaseContent();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest(".grip")) return;
      const scroller =
        target.closest<HTMLElement>(".sheet-scroll") ??
        (kind === "detail"
          ? el.querySelector<HTMLElement>(".detail-scroll")
          : null);
      canExpandContent = kind !== "search" && current() < 0.935;
      canCollapseContent = !!scroller && scroller.scrollTop <= 1;
      if (
        !matchMedia("(max-width:768px)").matches ||
        !scroller ||
        (!canExpandContent && !canCollapseContent) ||
        target.closest("input,textarea,[contenteditable]") ||
        el.querySelector(
          "input:focus,textarea:focus,[contenteditable]:focus",
        ) ||
        (window.visualViewport?.scale ?? 1) !== 1
      )
        return;
      const touch = e.touches[0];
      contentTouch = touch.identifier;
      pointer = 0;
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      startT = lastT = e.timeStamp;
      velocity = 0;
    };
    const contentMove = (e: TouchEvent) => {
      const touch = Array.from(e.touches).find(
        (t) => t.identifier === contentTouch,
      );
      if (!touch) return;
      if (!dragging) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = touch.clientY - startY;
        // A partial detail sheet expands before content scrolls. Downward
        // collapse still requires starting at the top. Ownership never changes
        // mid-gesture, including when expansion reaches its upper stop.
        if (
          !(dy < 0 ? canExpandContent : canCollapseContent) ||
          Math.abs(dy) <= dx * 1.2 ||
          e.timeStamp - startT > 350 ||
          !e.cancelable
        ) {
          releaseContent();
          return;
        }
        beginDrag();
      }
      if (!e.cancelable) {
        finishDrag(true, e.timeStamp);
        releaseContent();
        return;
      }
      e.preventDefault();
      updateDrag(touch.clientY, e.timeStamp);
    };
    const contentEnd = (e: TouchEvent) => {
      if (contentTouch === null) return;
      finishDrag(e.type === "touchcancel", e.timeStamp);
      releaseContent();
    };
    const click = (e: MouseEvent) => {
      if (suppressClick && e.detail !== 0) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    };
    el.addEventListener("click", click, true);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
    el.addEventListener("touchstart", contentStart, { passive: true });
    // Keep this registered before touchstart: WebKit decides whether scrolling
    // is cancellable at the start of a sequence. Adding it during touchstart can
    // be too late after native momentum scrolling. Ineligible moves are no-ops.
    el.addEventListener("touchmove", contentMove, { passive: false });
    el.addEventListener("touchend", contentEnd, { passive: true });
    el.addEventListener("touchcancel", contentEnd, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener("click", click, true);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
      releaseContent();
      el.removeEventListener("touchmove", contentMove);
      el.removeEventListener("touchstart", contentStart);
      el.removeEventListener("touchend", contentEnd);
      el.removeEventListener("touchcancel", contentEnd);
    };
  }, [kind]);
  return (
    <section
      ref={ref}
      className={`sheet ${kind}-sheet ${extent < 0.9 ? "scroll-locked" : ""} ${extent < 0.3 ? "collapsed" : ""} ${hidden ? "sheet-hidden" : ""}`}
      aria-label={
        kind === "search"
          ? "Creator directory"
          : kind === "favorites"
            ? "Favorites"
            : "Creator details"
      }
      inert={hidden}
      aria-hidden={hidden}
    >
      <button
        className="grip"
        data-drag
        aria-label={extent < 0.9 ? "Expand panel" : "Collapse panel"}
        onClick={() =>
          onExtent(
            extent < 0.9
              ? 0.94
              : kind !== "search"
                ? 0.56
                : searchCollapsed(innerHeight),
          )
        }
      >
        <span />
      </button>
      {children}
    </section>
  );
}

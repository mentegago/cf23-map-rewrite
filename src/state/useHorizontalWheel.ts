import { useCallback } from "react";

/** Keep horizontal/diagonal trackpad gestures and browser zoom native. */
export function useHorizontalWheel() {
  return useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        event.deltaX !== 0 ||
        !event.deltaY ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? element.clientWidth
            : 1;
      const next = Math.max(
        0,
        Math.min(
          element.scrollWidth - element.clientWidth,
          element.scrollLeft + event.deltaY * unit,
        ),
      );
      // At either end, let the wheel continue scrolling the surrounding page.
      if (Math.abs(next - element.scrollLeft) < 0.5) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
}

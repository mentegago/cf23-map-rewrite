import { useEffect, type RefObject } from "react";

/** Observe native scrolling gestures without taking ownership of the scroll. */
export function useDismissKeyboardOnSwipe(
  scroller: RefObject<HTMLElement | null>,
  input: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let start: { id: number; x: number; y: number } | null = null;
    const reset = () => {
      start = null;
    };
    const onStart = (event: TouchEvent) => {
      reset();
      if (
        event.touches.length !== 1 ||
        document.activeElement !== input.current
      )
        return;
      const touch = event.touches[0];
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.identifier !== start.id) {
        reset();
        return;
      }
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (Math.max(dx, dy) < 12) return;
      reset();
      if (dy > dx * 1.2 && document.activeElement === input.current)
        input.current?.blur();
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: true });
    element.addEventListener("touchend", reset, { passive: true });
    element.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", reset);
      element.removeEventListener("touchcancel", reset);
    };
  }, [scroller, input]);
}

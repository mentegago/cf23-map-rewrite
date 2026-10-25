import { useEffect, useState, type RefObject } from "react";

/** Infer a docked keyboard from input focus and lost visible height. */
export function useSearchKeyboard(
  input: RefObject<HTMLInputElement | null>,
  enabled: boolean,
) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) {
      setOpen(false);
      return;
    }
    let baseline = Math.max(innerHeight, viewport.height);
    let frame = 0;
    const update = () => {
      const focused = document.activeElement === input.current;
      if (!focused && viewport.scale === 1)
        baseline = Math.max(innerHeight, viewport.height);
      const lostHeight = Math.max(baseline, innerHeight) - viewport.height;
      setOpen(focused && viewport.scale === 1 && lostHeight > 150);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const rotate = () => {
      baseline = innerHeight;
      schedule();
    };
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", rotate);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", rotate);
    };
  }, [enabled, input]);
  return enabled && open;
}

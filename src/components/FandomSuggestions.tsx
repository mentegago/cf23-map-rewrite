import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Fandom } from "../domain/types";

export function FandomSuggestions({
  fandoms,
  onSelect,
}: {
  fandoms: Fandom[];
  onSelect: (fandom: Fandom) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const contentKey = fandoms.map((f) => f.id).join(",");
  useLayoutEffect(() => {
    const el = strip.current!;
    el.scrollTo({ left: 0, behavior: "instant" });
    const measure = () => {
      const before = el.scrollLeft > 1;
      const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((old) =>
        old.before === before && old.after === after ? old : { before, after },
      );
    };
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    for (const child of el.children) resize.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [contentKey]);
  const browse = (direction: number) => {
    const el = strip.current!;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <div className="suggestions-browser">
      <button
        type="button"
        className="icon-button suggestions-arrow"
        aria-label="Previous fandoms"
        title="Previous fandoms"
        disabled={!edges.before}
        onClick={() => browse(-1)}
      >
        <ChevronLeft size={18} />
      </button>
      <div ref={strip} className="suggestions" aria-label="Suggested fandoms">
        {fandoms.map((f) => (
          <button
            type="button"
            className="tag cyan-tint"
            key={f.id}
            onClick={() => onSelect(f)}
          >
            {f.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-button suggestions-arrow"
        aria-label="More fandoms"
        title="More fandoms"
        disabled={!edges.after}
        onClick={() => browse(1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

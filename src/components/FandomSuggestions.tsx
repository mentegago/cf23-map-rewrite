import { useLayoutEffect, useRef } from "react";
import type { Fandom } from "../domain/types";

export function FandomSuggestions({
  fandoms,
  onSelect,
}: {
  fandoms: Fandom[];
  onSelect: (fandomId: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const contentKey = fandoms.map((f) => f.id).join(",");
  useLayoutEffect(() => {
    strip.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [contentKey]);
  if (!fandoms.length) return null;
  return (
    <div
      ref={strip}
      className="suggestions"
      role="group"
      aria-label="Suggested fandoms"
      tabIndex={0}
    >
      {fandoms.map((f) => (
        <button
          type="button"
          className="tag cyan-tint"
          key={f.id}
          onClick={() => onSelect(f.id)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

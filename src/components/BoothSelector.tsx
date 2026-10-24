import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, Images, MapPin, X } from "lucide-react";
import type { Creator } from "../domain/types";

/** Native modal focus/inertness, with an exit phase before navigation. */
export function BoothSelector({
  booth,
  creators,
  onSelect,
  onGallery,
  onClose,
}: {
  booth: string;
  creators: Creator[];
  onSelect: (creator: Creator) => void;
  onGallery: (creator: Creator) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropDown = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [closing, setClosing] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  useLayoutEffect(() => {
    if (!closing) return;
    const finish = () => {
      const action = pending.current;
      pending.current = null;
      // Restore native modal focus before opening the next screen. Restoring a
      // previously focused search field afterwards would hide creator details.
      dialog.current?.close();
      action?.();
    };
    const timer = window.setTimeout(
      finish,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
    return () => clearTimeout(timer);
  }, [closing]);

  const dismiss = (action = onClose) => {
    if (pending.current) return;
    pending.current = action;
    setClosing(true);
  };
  const outside = (x: number, y: number) => {
    const r = dialog.current!.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  };
  return (
    <dialog
      ref={dialog}
      className={`selector-dialog ${closing ? "closing" : ""}`}
      aria-label={`Creators at booth ${booth}`}
      aria-describedby="booth-selector-description"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onPointerDown={(e) => {
        backdropDown.current =
          e.target === e.currentTarget && outside(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        backdropDown.current = false;
      }}
      onClick={(e) => {
        // An opening map tap can finish over this newly mounted modal. Only a
        // fresh gesture that both starts and ends on the backdrop dismisses it.
        if (
          backdropDown.current &&
          e.target === e.currentTarget &&
          outside(e.clientX, e.clientY)
        )
          dismiss();
        backdropDown.current = false;
      }}
    >
      <header className="selector-header">
        <span className="selector-pin" aria-hidden="true">
          <MapPin size={26} />
        </span>
        <div>
          <span className="kicker">One booth, more to explore</span>
          <h2>Booth {booth}</h2>
        </div>
        <button
          autoFocus
          className="icon-button"
          aria-label="Close booth selector"
          onClick={() => dismiss()}
        >
          <X />
        </button>
      </header>
      <p id="booth-selector-description">
        Who's on your list? Pick a creator to explore.
      </p>
      <div className="selector-choices">
        {[...creators]
          .sort((a, b) =>
            (a.attendanceDates[0] || "~").localeCompare(
              b.attendanceDates[0] || "~",
            ),
          )
          .map((creator, index) => (
            <div
              className="selector-choice-entry"
              key={creator.id}
              style={
                {
                  "--choice-delay": `${Math.min(index, 5) * 45}ms`,
                } as CSSProperties
              }
            >
              <button
                className={`selector-choice ${chosen === creator.id ? "chosen" : ""}`}
                disabled={closing}
                onClick={() => {
                  if (pending.current) return;
                  setChosen(creator.id);
                  dismiss(() => onSelect(creator));
                }}
              >
                <span
                  className={`selector-day ${creator.day === "Sat" ? "sat" : creator.day === "Sun" ? "sun" : "both"}`}
                >
                  <CalendarDays size={15} />
                  {creator.day || "Event days"}
                </span>
                <strong>{creator.name}</strong>
                <span className="selector-fandoms">
                  {creator.fandoms
                    .slice(0, 3)
                    .map((f) => f.name)
                    .join(" · ") || "Explore this creator"}
                </span>
                <ArrowUpRight
                  className="selector-arrow"
                  size={22}
                  aria-hidden="true"
                />
              </button>
              {creator.assets.gallery.length > 0 && (
                <button
                  className="icon-button selector-catalog"
                  aria-label={`View ${creator.name} catalog`}
                  disabled={closing}
                  onClick={() => dismiss(() => onGallery(creator))}
                >
                  <Images size={19} />
                </button>
              )}
            </div>
          ))}
      </div>
    </dialog>
  );
}

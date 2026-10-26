import { useLayoutEffect, useRef } from "react";
import { MapPin, Flag, X } from "lucide-react";
import type { VisitStop } from "../map/visitRoute";

export function VisitEndpointPicker({
  kind,
  stops,
  name,
  onChoose,
  onClose,
}: {
  kind: "start" | "end";
  stops: VisitStop[];
  name: (stop: VisitStop) => string;
  onChoose: (stop: VisitStop | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="visit-day-dialog collection-dialog endpoint-dialog"
      aria-label={kind === "start" ? "Choose start" : "Choose end"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="collection-dialog-header">
        {kind === "start" ? <MapPin size={22} /> : <Flag size={22} />}
        <h2 tabIndex={-1}>
          {kind === "start" ? "Choose start" : "Choose end"}
        </h2>
        <button className="icon-button" aria-label="Cancel" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div className="collection-dialog-body endpoint-choices">
        <button onClick={() => onChoose(null)}>
          <strong>{kind === "start" ? "Entrance" : "No fixed end"}</strong>
          <small>
            {kind === "start"
              ? "Default starting point"
              : "Finish wherever makes the walk shortest"}
          </small>
        </button>
        {stops.map((stop) => (
          <button key={stop.booth} onClick={() => onChoose(stop)}>
            <strong>{stop.booth}</strong>
            <small>{name(stop)}</small>
          </button>
        ))}
      </div>
    </dialog>
  );
}

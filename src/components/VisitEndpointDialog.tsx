import { useLayoutEffect, useRef } from "react";
import { MapPin } from "lucide-react";

export function VisitEndpointDialog({
  booth,
  kind = "start",
  conflict = false,
  onConfirm,
  onClose,
}: {
  booth: string;
  kind?: "start" | "end";
  conflict?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="visit-day-dialog"
      aria-labelledby="visit-endpoint-title"
      aria-describedby="visit-endpoint-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <MapPin size={28} aria-hidden="true" />
      <h2 id="visit-endpoint-title">
        {kind === "start"
          ? `Start from ${booth}?`
          : booth === "Anywhere"
            ? "Clear fixed end?"
            : `End at ${booth}?`}
      </h2>
      <p id="visit-endpoint-description">
        {kind === "start"
          ? `Start a new route from ${booth} and visit the remaining booths from there.`
          : booth === "Anywhere"
            ? "Let the route finish wherever makes the walk shortest."
            : `Reorder your route so ${booth} is your last stop.`}
        {conflict &&
          (kind === "start"
            ? " This also clears your fixed end."
            : " This also resets your start to Entrance.")}
      </p>
      <div className="visit-day-options">
        <button
          className="action cyan"
          onClick={() => {
            ref.current?.close();
            onConfirm();
          }}
        >
          {kind === "start"
            ? "Start from here"
            : booth === "Anywhere"
              ? "No fixed end"
              : "End here"}
        </button>
      </div>
      <button className="visit-day-cancel" onClick={onClose} autoFocus>
        Keep current route
      </button>
    </dialog>
  );
}

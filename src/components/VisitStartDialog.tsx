import { useLayoutEffect, useRef } from "react";
import { MapPin } from "lucide-react";

export function VisitStartDialog({
  booth,
  onConfirm,
  onClose,
}: {
  booth: string;
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
      aria-labelledby="visit-start-title"
      aria-describedby="visit-start-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <MapPin size={28} aria-hidden="true" />
      <h2 id="visit-start-title">Start from {booth}?</h2>
      <p id="visit-start-description">
        Use {booth} as your current location. We'll plan a new route from here
        to the other booths in your list, keeping any booths you've skipped out
        of the route.
      </p>
      <div className="visit-day-options">
        <button
          className="action cyan"
          onClick={() => {
            ref.current?.close();
            onConfirm();
          }}
        >
          Start from here
        </button>
      </div>
      <button className="visit-day-cancel" onClick={onClose} autoFocus>
        Keep current route
      </button>
    </dialog>
  );
}

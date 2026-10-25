import { useLayoutEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";

export function VisitDayDialog({
  days,
  onChoose,
  onClose,
  confirmSwitch = false,
}: {
  days: { id: string; label: string }[];
  onChoose: (day: string) => void;
  onClose: () => void;
  confirmSwitch?: boolean;
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
      aria-labelledby="visit-day-title"
      aria-describedby="visit-day-description"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <CalendarDays size={28} aria-hidden="true" />
      <h2 id="visit-day-title">
        {confirmSwitch
          ? `Switch to ${days[0].label}?`
          : "When are you visiting?"}
      </h2>
      <p id="visit-day-description">
        {confirmSwitch
          ? "Switching days restarts your route at stop 1."
          : "Some creators in this list only attend on certain days."}
      </p>
      <div className="visit-day-options">
        {days.map((day) => (
          <button
            key={day.id}
            className="action cyan"
            onClick={() => {
              ref.current?.close();
              onChoose(day.id);
            }}
          >
            {confirmSwitch ? `Switch to ${day.label}` : day.label}
          </button>
        ))}
      </div>
      <button
        className="visit-day-cancel"
        onClick={onClose}
        autoFocus={confirmSwitch}
      >
        {confirmSwitch ? "Keep current day" : "Back to list"}
      </button>
    </dialog>
  );
}

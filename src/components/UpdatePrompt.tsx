import { useLayoutEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";

export function UpdatePrompt({
  onUpdate,
  onDismiss,
}: {
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const updateButton = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const [updating, setUpdating] = useState(false);
  useLayoutEffect(() => {
    const el = dialog.current!;
    el.showModal();
    updateButton.current?.focus({ preventScroll: true });
    return () => el.close();
  }, []);
  useLayoutEffect(() => {
    if (!closing) return;
    const timer = setTimeout(
      () => {
        dialog.current?.close();
        onDismiss();
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
    return () => clearTimeout(timer);
  }, [closing, onDismiss]);
  const dismiss = () => {
    if (!updating) setClosing(true);
  };
  return (
    <dialog
      ref={dialog}
      className={`selector-dialog update-dialog ${closing ? "closing" : ""}`}
      aria-labelledby="update-title"
      aria-describedby="update-description"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <button
        className="icon-button update-close"
        aria-label="Dismiss update notice"
        onClick={dismiss}
        disabled={updating}
      >
        <X size={20} />
      </button>
      <div className="update-art" aria-hidden="true">
        <Sparkles className="update-spark spark-left" size={24} />
        <div className="update-map">
          <span className="update-eyes" />
          <span className="update-smile" />
        </div>
        <Sparkles className="update-spark spark-right" size={32} />
      </div>
      <h2 id="update-title">A new version is ready!</h2>
      <p id="update-description">
        Update CF23 Map to get the latest improvements. Your favorites will stay
        right here.
      </p>
      <div className="update-buttons">
        <button
          ref={updateButton}
          className="action yellow"
          disabled={closing || updating}
          onClick={() => {
            setUpdating(true);
            onUpdate();
          }}
        >
          <RefreshCw size={18} />
          {updating ? "Updating…" : "Update app"}
        </button>
        <button
          className="text-button"
          disabled={closing || updating}
          onClick={dismiss}
        >
          Maybe later
        </button>
      </div>
    </dialog>
  );
}

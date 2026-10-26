import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

/** Anchored action menu using the browser's top layer and light dismissal.
 * Rendered outside its trigger's layout so scroll containers cannot clip it.
 */
export function ContextMenu({
  label,
  items,
  className,
  children,
}: {
  label: string;
  items: ContextMenuItem[];
  className?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const initialFocus = useRef<"first" | "last">("first");
  const close = (restore = false) => {
    if (restore) trigger.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const el = menu.current,
      button = trigger.current;
    let anchor = button.getBoundingClientRect();
    const position = () => {
      const view = window.visualViewport;
      const left = view?.offsetLeft ?? 0,
        top = view?.offsetTop ?? 0;
      const width = view?.width ?? innerWidth,
        height = view?.height ?? innerHeight;
      const rect = button.getBoundingClientRect(),
        gap = 8,
        edge = 12;
      el.style.maxWidth = `${width - edge * 2}px`;
      el.style.maxHeight = `${height - edge * 2}px`;
      const box = { width: el.offsetWidth, height: el.offsetHeight };
      const below = top + height - edge - rect.bottom - gap,
        above = rect.top - gap - top - edge;
      const upward = below < box.height && above > below;
      el.style.maxHeight = `${Math.max(44, upward ? above : below)}px`;
      const h = Math.min(box.height, Math.max(44, upward ? above : below));
      el.style.left = `${Math.max(left + edge, Math.min(rect.right - box.width, left + width - edge - box.width))}px`;
      el.style.top = `${Math.max(top + edge, Math.min(upward ? rect.top - gap - h : rect.bottom + gap, top + height - edge - h))}px`;
      el.dataset.side = upward ? "above" : "below";
      anchor = rect;
    };
    const toggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") setOpen(false);
    };
    const scrolled = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return;
      const rect = button.getBoundingClientRect();
      // Ignore a queued scroll event from bringing the trigger into view before opening.
      if (
        Math.abs(rect.top - anchor.top) > 0.5 ||
        Math.abs(rect.left - anchor.left) > 0.5
      )
        setOpen(false);
    };
    el.addEventListener("toggle", toggle);
    el.showPopover();
    position();
    const enabled = el.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    (initialFocus.current === "last"
      ? enabled[enabled.length - 1]
      : enabled[0]
    )?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(el);
    observer.observe(button);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", scrolled, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      el.removeEventListener("toggle", toggle);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", scrolled, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      if (el.matches(":popover-open")) el.hidePopover();
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = "first";
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            initialFocus.current = e.key === "ArrowUp" ? "last" : "first";
            setOpen(true);
          }
        }}
      >
        {children ?? (
          <>
            {label}
            <ChevronDown size={13} aria-hidden="true" />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            popover="auto"
            role="menu"
            aria-label={label}
            className="context-menu"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(true);
                return;
              }
              if (e.key === "Tab") {
                close(true);
                return;
              }
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]:not(:disabled)',
                ),
              );
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let next: HTMLButtonElement | undefined;
              if (e.key === "ArrowDown")
                next = buttons[(current + 1) % buttons.length];
              else if (e.key === "ArrowUp")
                next = buttons[(current - 1 + buttons.length) % buttons.length];
              else if (e.key === "Home") next = buttons[0];
              else if (e.key === "End") next = buttons.at(-1);
              else if (
                e.key.length === 1 &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
              )
                next = [
                  ...buttons.slice(current + 1),
                  ...buttons.slice(0, current + 1),
                ].find((b) =>
                  b.textContent
                    ?.trim()
                    .toLowerCase()
                    .startsWith(e.key.toLowerCase()),
                );
              if (next) {
                e.preventDefault();
                next.focus();
              }
            }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                className={item.destructive ? "is-destructive" : undefined}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

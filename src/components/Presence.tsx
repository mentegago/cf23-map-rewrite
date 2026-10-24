import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Retain outgoing content until its exit animation finishes. */
export function Presence({
  visible,
  children,
  className,
  keepMounted = false,
}: {
  visible: boolean;
  children: ReactNode;
  className: string;
  keepMounted?: boolean;
}) {
  const last = useRef(children);
  const [mounted, setMounted] = useState(visible);
  if (visible) last.current = children;
  useLayoutEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 350);
    return () => clearTimeout(timer);
  }, [visible]);
  return visible || mounted || keepMounted ? (
    <div
      className={`${className} ${visible ? "entering" : "exiting"}`}
      inert={!visible}
      aria-hidden={!visible}
      hidden={!visible && !mounted}
    >
      {keepMounted ? children : last.current}
    </div>
  ) : null;
}

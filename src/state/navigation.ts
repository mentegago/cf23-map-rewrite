/** Detect the current app window, not whether the app is installed elsewhere. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function resetStandaloneURL() {
  if (!isStandalone()) return;
  const root = new URL(import.meta.env.BASE_URL, location.origin);
  if (location.href !== root.href) history.replaceState(null, "", root);
}

/** Standalone sheets use in-memory navigation; browser tabs retain deep links. */
export function updateNavigationURL(
  url: URL | string,
  mode: "push" | "replace",
) {
  if (isStandalone()) {
    resetStandaloneURL();
    return;
  }
  if (mode === "push") history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

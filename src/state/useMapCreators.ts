import { useEffect, useState } from "react";
import type { AppModel } from "./useApp";

/** Keep typing responsive without delaying explicit selections or clearing. */
export function useMapCreators(app: AppModel) {
  const searching = app.searchSelection.kind === "fandom" || !!app.query.trim();
  const creators = app.favoritesMode
    ? app.filteredFavoriteCreators
    : searching
      ? app.results
      : app.creators;
  const typing =
    !app.favoritesMode &&
    app.searchSelection.kind === "text" &&
    !!app.query.trim();
  const [settled, setSettled] = useState(creators);
  useEffect(() => {
    if (!typing) {
      setSettled(creators);
      return;
    }
    const timer = setTimeout(() => setSettled(creators), 150);
    return () => clearTimeout(timer);
  }, [creators, typing]);
  return typing ? settled : creators;
}

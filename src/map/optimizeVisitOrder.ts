/** Bounded 2-opt for an open route: keep the start fixed, but allow the final stop to change.
 * Costs must be symmetric walking distances; Infinity means a candidate is unavailable.
 */
export function optimizeVisitOrder(
  start: number,
  stops: number[],
  distance: (a: number, b: number) => number,
  lowerBound: (a: number, b: number) => number,
) {
  const order = [start, ...stops];
  let checks = 0;
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (++checks > 20000) return order.slice(1);
        const a = order[i - 1],
          b = order[i],
          c = order[j],
          d = order[j + 1];
        const oldCost = distance(a, b) + (d === undefined ? 0 : distance(c, d));
        if (
          lowerBound(a, c) + (d === undefined ? 0 : lowerBound(b, d)) >=
          oldCost
        )
          continue;
        const newCost = distance(a, c) + (d === undefined ? 0 : distance(b, d));
        if (newCost >= oldCost) continue;
        for (let left = i, right = j; left < right; left++, right--)
          [order[left], order[right]] = [order[right], order[left]];
        improved = true;
      }
    }
    if (!improved) break;
  }
  return order.slice(1);
}

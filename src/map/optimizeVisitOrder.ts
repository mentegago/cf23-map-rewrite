export interface VisitOrderOptions {
  end?: number;
  shouldStop?: () => boolean;
  maxChecks?: number;
}

/** Open-route local search over symmetric aisle distances. Endpoints never move.
 * Keep a feasible incumbent throughout; unfinished seeds and moves are discarded.
 */
export function optimizeVisitOrder(
  start: number,
  stops: number[],
  distance: (a: number, b: number) => number,
  lowerBound: (a: number, b: number) => number,
  options: VisitOrderOptions = {},
) {
  const fixedEnd = options.end !== undefined && stops.includes(options.end);
  const seed = fixedEnd
    ? [...stops.filter((s) => s !== options.end), options.end!]
    : [...stops];
  let checks = 0;
  const exhausted = () =>
    ++checks > (options.maxChecks ?? 50000) || !!options.shouldStop?.();
  const cost = (route: number[]) =>
    route.reduce(
      (sum, node, i) => sum + distance(i ? route[i - 1] : start, node),
      0,
    );
  let best = seed;
  let bestCost = cost(best);
  const improve = (input: number[]) => {
    const order = [start, ...input];
    const limit = order.length - (fixedEnd ? 1 : 0);
    for (let pass = 0; pass < 8; pass++) {
      let improved = false;
      for (let i = 1; i < limit - 1; i++)
        for (let j = i + 1; j < limit; j++) {
          if (exhausted()) return order.slice(1);
          const a = order[i - 1],
            b = order[i],
            c = order[j],
            d = order[j + 1];
          const old = distance(a, b) + (d === undefined ? 0 : distance(c, d));
          if (
            lowerBound(a, c) + (d === undefined ? 0 : lowerBound(b, d)) >=
            old
          )
            continue;
          const next = distance(a, c) + (d === undefined ? 0 : distance(b, d));
          if (next < old) {
            for (let l = i, r = j; l < r; l++, r--)
              [order[l], order[r]] = [order[r], order[l]];
            improved = true;
          }
        }
      // Relocating one or two consecutive stops escapes reversals-only local minima.
      for (const length of [1, 2])
        for (let i = 1; i + length <= limit; i++) {
          const a = order[i - 1],
            b = order[i],
            c = order[i + length - 1],
            d = order[i + length];
          for (let j = 1; j <= limit; j++) {
            if ((j >= i && j <= i + length) || (j === order.length && fixedEnd))
              continue;
            if (exhausted()) return order.slice(1);
            const u = order[j - 1],
              v = order[j];
            const old =
              distance(a, b) +
              (d === undefined ? 0 : distance(c, d)) +
              (v === undefined ? 0 : distance(u, v));
            const next =
              (d === undefined ? 0 : distance(a, d)) +
              distance(u, b) +
              (v === undefined ? 0 : distance(c, v));
            if (next < old) {
              const segment = order.splice(i, length);
              order.splice(j > i ? j - length : j, 0, ...segment);
              improved = true;
              break;
            }
          }
        }
      if (!improved) break;
    }
    return order.slice(1);
  };
  const accept = (route: number[]) => {
    const improved = improve(route),
      total = cost(improved);
    if (total < bestCost) {
      best = improved;
      bestCost = total;
    }
  };
  accept(seed);
  if (exhausted() || stops.length < 3) return best;
  // Cheapest insertion accounts for the final destination while constructing the seed.
  const insertion = fixedEnd ? [options.end!] : [];
  const pending = seed.filter((s) => s !== options.end);
  while (pending.length) {
    let choice = -1,
      slot = -1,
      gain = Infinity;
    for (let i = 0; i < pending.length; i++)
      for (let j = 0; j <= insertion.length - (fixedEnd ? 1 : 0); j++) {
        if (exhausted()) return best;
        const a = j ? insertion[j - 1] : start,
          b = insertion[j],
          node = pending[i];
        const added =
          distance(a, node) +
          (b === undefined ? 0 : distance(node, b) - distance(a, b));
        if (added < gain) {
          choice = i;
          slot = j;
          gain = added;
        }
      }
    if (choice < 0) return best;
    insertion.splice(slot, 0, pending.splice(choice, 1)[0]);
  }
  accept(insertion);
  return best;
}

interface Entry {
  node: number;
  cost: number;
  estimate: number;
}

/** Four-way A* with a consistent Manhattan heuristic and reusable search storage. */
export class GridPathfinder {
  private costs: Int32Array;
  private parents: Int32Array;
  private stamps: Uint32Array;
  private stamp = 0;
  constructor(
    private cols: number,
    private blocked: Uint8Array,
  ) {
    this.costs = new Int32Array(blocked.length);
    this.parents = new Int32Array(blocked.length);
    this.stamps = new Uint32Array(blocked.length);
  }
  lowerBound = (a: number, b: number) =>
    Math.abs((a % this.cols) - (b % this.cols)) +
    Math.abs(Math.floor(a / this.cols) - Math.floor(b / this.cols));

  find(
    start: number,
    goal: number,
    budget = Infinity,
    shouldStop?: () => boolean,
  ) {
    if (
      start < 0 ||
      goal < 0 ||
      start >= this.blocked.length ||
      goal >= this.blocked.length ||
      this.blocked[start] ||
      this.blocked[goal]
    )
      return { cells: null, expanded: 0 };
    if (++this.stamp === 0xffffffff) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    const heap: Entry[] = [];
    const before = (a: Entry, b: Entry) =>
      a.estimate < b.estimate || (a.estimate === b.estimate && a.cost > b.cost);
    const push = (entry: Entry) => {
      let i = heap.length;
      heap.push(entry);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!before(entry, heap[parent])) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = entry;
    };
    const pop = () => {
      const first = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && before(heap[child + 1], heap[child]))
            child++;
          if (!before(heap[child], last)) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    this.costs[start] = 0;
    this.stamps[start] = this.stamp;
    this.parents[start] = start;
    push({ node: start, cost: 0, estimate: this.lowerBound(start, goal) });
    let expanded = 0;
    while (heap.length && expanded < budget) {
      const { node, cost } = pop();
      if (cost !== this.costs[node]) continue;
      expanded++;
      if ((expanded & 1023) === 0 && shouldStop?.())
        return { cells: null, expanded };
      if (node === goal) {
        const cells = [goal];
        for (let i = goal; i !== start;) {
          i = this.parents[i];
          cells.push(i);
        }
        return { cells: cells.reverse(), expanded };
      }
      const x = node % this.cols;
      for (const next of [
        x > 0 ? node - 1 : -1,
        x < this.cols - 1 ? node + 1 : -1,
        node - this.cols,
        node + this.cols,
      ]) {
        if (next < 0 || next >= this.blocked.length || this.blocked[next])
          continue;
        const nextCost = cost + 1;
        if (this.stamps[next] === this.stamp && this.costs[next] <= nextCost)
          continue;
        this.stamps[next] = this.stamp;
        this.costs[next] = nextCost;
        this.parents[next] = node;
        push({
          node: next,
          cost: nextCost,
          estimate: nextCost + this.lowerBound(next, goal),
        });
      }
    }
    return { cells: null, expanded };
  }
}

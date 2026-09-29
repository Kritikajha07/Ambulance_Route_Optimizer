// Hand-written shortest path algorithms (no library shortest-path calls).
export type Adj = { to: number; w: number; e: number }[][];
export interface Ops {
  heapPush: number;
  heapPop: number;
  relaxations: number;
  comparisons: number;
  total: number;
}
export interface SPResult {
  dist: number[];
  prevNode: number[];
  prevEdge: number[];
  ops: Ops;
  stages?: number;
}

/** Binary min-heap keyed by distance. */
export class MinHeap {
  private a: [number, number][] = [];
  cmp = 0;
  get size() {
    return this.a.length;
  }
  push(key: number, val: number) {
    const a = this.a;
    a.push([key, val]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      this.cmp++;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length) { this.cmp++; if (a[l][0] < a[m][0]) m = l; }
        if (r < a.length) { this.cmp++; if (a[r][0] < a[m][0]) m = r; }
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Dijkstra with lazy-deletion min-heap. O((V+E) log V). */
export function dijkstra(adj: Adj, src: number, excludedEdges?: Set<number>): SPResult {
  const n = adj.length;
  const dist = new Array(n).fill(Infinity);
  const prevNode = new Array(n).fill(-1);
  const prevEdge = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  const ops: Ops = { heapPush: 0, heapPop: 0, relaxations: 0, comparisons: 0, total: 0 };
  const heap = new MinHeap();
  dist[src] = 0;
  heap.push(0, src); ops.heapPush++;
  while (heap.size) {
    const [d, u] = heap.pop()!; ops.heapPop++;
    if (done[u] || d > dist[u]) continue;
    done[u] = true;
    for (const { to, w, e } of adj[u]) {
      if (excludedEdges?.has(e)) continue;
      ops.comparisons++;
      // Relaxation: if dist[u] + w(u,v) < dist[v], improve.
      if (dist[u] + w < dist[to]) {
        dist[to] = dist[u] + w;
        prevNode[to] = u;
        prevEdge[to] = e;
        heap.push(dist[to], to); ops.heapPush++;
        ops.relaxations++;
      }
    }
  }
  ops.comparisons += heap.cmp;
  ops.total = ops.heapPush + ops.heapPop + ops.comparisons;
  return { dist, prevNode, prevEdge, ops };
}

/**
 * Dynamic Programming shortest path (stage-based, Bellman–Ford style).
 * State D[k][v] = min travel time from src to v using at most k road segments.
 * Recurrence: D[k][v] = min( D[k-1][v], min_{(u,v)∈E} D[k-1][u] + w(u,v) ), D[0][src]=0.
 * Only two rows are kept (rolling array). Stops early when a stage changes nothing.
 */
export function dpShortest(adj: Adj, src: number): SPResult {
  const n = adj.length;
  let prev = new Array(n).fill(Infinity);
  const prevNode = new Array(n).fill(-1);
  const prevEdge = new Array(n).fill(-1);
  const ops: Ops = { heapPush: 0, heapPop: 0, relaxations: 0, comparisons: 0, total: 0 };
  prev[src] = 0;
  let stages = 0;
  for (let k = 1; k < n; k++) {
    const cur = prev.slice();
    let changed = false;
    for (let u = 0; u < n; u++) {
      if (prev[u] === Infinity) continue;
      for (const { to, w, e } of adj[u]) {
        ops.comparisons++;
        if (prev[u] + w < cur[to]) {
          cur[to] = prev[u] + w;
          prevNode[to] = u;
          prevEdge[to] = e;
          ops.relaxations++;
          changed = true;
        }
      }
    }
    prev = cur;
    stages = k;
    if (!changed) break;
  }
  ops.total = ops.comparisons + ops.relaxations;
  return { dist: prev, prevNode, prevEdge, ops, stages };
}

export function reconstruct(r: SPResult, target: number) {
  if (r.dist[target] === Infinity) return null;
  const nodes: number[] = [target];
  const edges: number[] = [];
  let v = target;
  let guard = 0;
  while (r.prevNode[v] !== -1 && guard++ < 10000) {
    edges.push(r.prevEdge[v]);
    v = r.prevNode[v];
    nodes.push(v);
  }
  return { nodes: nodes.reverse(), edges: edges.reverse(), cost: r.dist[target] };
}

/** Alternatives: remove each edge of the best path once, re-run Dijkstra, keep distinct cheapest. */
export function alternatives(adj: Adj, src: number, target: number, best: number[], k = 2) {
  const seen = new Set([best.join(",")]);
  const out: { nodes: number[]; edges: number[]; cost: number }[] = [];
  for (const e of best) {
    const r = reconstruct(dijkstra(adj, src, new Set([e])), target);
    if (!r) continue;
    const key = r.edges.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, k);
}

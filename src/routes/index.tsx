import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { GRAPH, ambulanceEdges, TRAFFIC_MULT, type TrafficLevel, type GEdge } from "@/lib/graph";
import { dijkstra, dpShortest, reconstruct, alternatives, type Adj } from "@/lib/algorithms";

const RouteMap = lazy(() => import("@/components/RouteMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ambulance Route Optimizer — Ahmedabad (Dijkstra vs DP)" },
      { name: "description", content: "Interactive ambulance routing across Ahmedabad hospitals with Dijkstra and Dynamic Programming shortest paths, traffic simulation and road blocks." },
      { property: "og:title", content: "Ambulance Route Optimizer — Ahmedabad" },
      { property: "og:description", content: "Dijkstra vs Dynamic Programming shortest paths with live traffic and blocked-road recalculation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Intensity = "off" | "light" | "rush" | "gridlock";
const DIST: Record<Intensity, [number, number, number]> = {
  off: [0, 0, 0], light: [0.15, 0.05, 0.01], rush: [0.25, 0.15, 0.07], gridlock: [0.25, 0.25, 0.2],
};
const fmt = (m: number) => (m === Infinity ? "—" : m < 1 ? `${Math.round(m * 60)} s` : `${m.toFixed(1)} min`);

function randomTraffic(level: Intensity, edges: GEdge[]) {
  const [mo, he, se] = DIST[level];
  const t: Record<number, TrafficLevel> = {};
  for (const e of edges) {
    if (e.type === "access") continue;
    const r = Math.random();
    if (r < se) t[e.id] = "severe";
    else if (r < se + he) t[e.id] = "heavy";
    else if (r < se + he + mo) t[e.id] = "moderate";
  }
  return t;
}

function App() {
  const [amb, setAmb] = useState({ lat: 23.018, lng: 72.49 });
  const [target, setTarget] = useState<number | "auto">("auto");
  const [intensity, setIntensity] = useState<Intensity>("light");
  const [traffic, setTraffic] = useState<Record<number, TrafficLevel>>({});
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<"nav" | "rank" | "bench" | "viva">("nav");
  const [alerts, setAlerts] = useState<{ t: string; msg: string; kind: "warn" | "info" }[]>([]);
  const cause = useRef<string>("");

  useEffect(() => setTraffic(randomTraffic("light", GRAPH.edges)), []);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      cause.current = "live traffic update";
      setTraffic(randomTraffic(intensity === "off" ? "light" : intensity, GRAPH.edges));
    }, 5000);
    return () => clearInterval(id);
  }, [live, intensity]);

  const { nodes, edges, adj, src } = useMemo(() => {
    const ae = ambulanceEdges(amb.lat, amb.lng);
    const edges = [...GRAPH.edges, ...ae];
    const nodes = [...GRAPH.nodes, { id: "amb", name: "Ambulance", lat: amb.lat, lng: amb.lng, kind: "ambulance" as const }];
    const adj: Adj = nodes.map(() => []);
    for (const e of edges) {
      if (blocked.has(e.id)) continue;
      const w = e.baseMin * TRAFFIC_MULT[traffic[e.id] ?? "free"];
      adj[e.u].push({ to: e.v, w, e: e.id });
      adj[e.v].push({ to: e.u, w, e: e.id });
    }
    return { nodes, edges, adj, src: nodes.length - 1 };
  }, [amb, traffic, blocked]);

  const dj = useMemo(() => dijkstra(adj, src), [adj, src]);
  const ranking = useMemo(
    () => GRAPH.hospitalIdx.map((i) => ({ i, t: dj.dist[i] })).sort((a, b) => a.t - b.t),
    [dj],
  );
  const dest = target === "auto" ? ranking[0]?.i ?? null : target;
  const best = useMemo(() => (dest == null ? null : reconstruct(dj, dest)), [dj, dest]);
  const alts = useMemo(() => (best && dest != null ? alternatives(adj, src, dest, best.edges) : []), [adj, src, dest, best]);

  const routeKey = best ? `${dest}:${best.edges.join(",")}` : "none";
  const prevKey = useRef(routeKey);
  useEffect(() => {
    if (prevKey.current !== routeKey && cause.current) {
      const t = new Date().toLocaleTimeString();
      const msg = best
        ? `Route re-calculated due to ${cause.current}. New ETA ${fmt(best.cost)} to ${nodes[dest!].name}.`
        : `No route available after ${cause.current}!`;
      setAlerts((a) => [{ t, msg, kind: "warn" as const }, ...a].slice(0, 6));
    }
    prevKey.current = routeKey;
    cause.current = "";
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBlock = (id: number) => {
    const e = edges[id];
    setBlocked((b) => {
      const n = new Set(b);
      if (n.has(id)) { n.delete(id); cause.current = `reopening ${e.road}`; }
      else { n.add(id); cause.current = `blockage on ${e.road}`; }
      return n;
    });
  };

  const steps = useMemo(() => {
    if (!best) return [];
    const out: { road: string; from: string; to: string; km: number; min: number; jam: TrafficLevel }[] = [];
    best.edges.forEach((eid, k) => {
      const e = edges[eid];
      const w = e.baseMin * TRAFFIC_MULT[traffic[eid] ?? "free"];
      const jam = traffic[eid] ?? "free";
      const last = out[out.length - 1];
      if (last && last.road === e.road) {
        last.to = nodes[best.nodes[k + 1]].name; last.km += e.km; last.min += w;
        if (TRAFFIC_MULT[jam] > TRAFFIC_MULT[last.jam]) last.jam = jam;
      } else out.push({ road: e.road, from: nodes[best.nodes[k]].name, to: nodes[best.nodes[k + 1]].name, km: e.km, min: w, jam });
    });
    return out;
  }, [best, edges, nodes, traffic]);

  const jamCount = Object.keys(traffic).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground">+</span>
          <div>
            <h1 className="font-display text-lg font-bold leading-tight tracking-tight">Emergency Ambulance Route Optimizer</h1>
            <p className="text-xs text-muted-foreground">Ahmedabad, Gujarat · DAA project · Dijkstra &amp; Dynamic Programming</p>
          </div>
        </div>
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11px] text-accent">
          SIMULATED TRAFFIC · ESTIMATED TIMES · NOT FOR REAL DISPATCH
        </span>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <Panel title="Ambulance">
            <p className="font-mono text-xs text-muted-foreground">{amb.lat.toFixed(5)}, {amb.lng.toFixed(5)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Drag the 🚑 marker on the map to move it.</p>
            <button className="btn mt-2 w-full" onClick={() => navigator.geolocation?.getCurrentPosition(
              (p) => { cause.current = "ambulance moved"; setAmb({ lat: p.coords.latitude, lng: p.coords.longitude }); },
              () => setAlerts((a) => [{ t: new Date().toLocaleTimeString(), msg: "Location permission denied.", kind: "info" as const }, ...a]),
            )}>Use my live location</button>
          </Panel>

          <Panel title="Destination hospital">
            <select className="field" value={String(target)} onChange={(e) => { cause.current = "destination change"; setTarget(e.target.value === "auto" ? "auto" : Number(e.target.value)); }}>
              <option value="auto">Auto — nearest by travel time</option>
              {GRAPH.hospitalIdx.map((i) => <option key={i} value={i}>{GRAPH.nodes[i].name} ({GRAPH.nodes[i].area})</option>)}
            </select>
            {best && dest != null && (
              <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3">
                <div className="text-xs text-muted-foreground">Fastest route to</div>
                <div className="font-semibold">{nodes[dest].name}</div>
                <div className="mt-1 flex items-baseline gap-3 font-mono">
                  <span className="text-2xl font-bold text-primary">{fmt(best.cost)}</span>
                  <span className="text-xs text-muted-foreground">{best.edges.reduce((s, e) => s + edges[e].km, 0).toFixed(1)} km</span>
                </div>
                {nodes[dest].contact && <div className="mt-1 text-xs text-muted-foreground">☎ {nodes[dest].contact}</div>}
              </div>
            )}
            {!best && <p className="mt-3 text-sm text-destructive">No reachable route — unblock some roads.</p>}
          </Panel>

          <Panel title="Traffic simulator">
            <div className="grid grid-cols-4 gap-1">
              {(["off", "light", "rush", "gridlock"] as Intensity[]).map((l) => (
                <button key={l} className={`btn text-xs capitalize ${intensity === l ? "btn-active" : ""}`}
                  onClick={() => { setIntensity(l); cause.current = `${l} traffic`; setTraffic(randomTraffic(l, GRAPH.edges)); }}>{l}</button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn flex-1 text-xs" onClick={() => { cause.current = "traffic change"; setTraffic(randomTraffic(intensity, GRAPH.edges)); }}>Re-roll jams</button>
              <button className={`btn flex-1 text-xs ${live ? "btn-active" : ""}`} onClick={() => setLive(!live)}>{live ? "● Live (5s)" : "Start live"}</button>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <Legend c="var(--map-route)" l="Selected fastest route" />
              <Legend c="var(--map-alt)" l="Alternative routes" dashed />
              <Legend c="var(--jam-moderate)" l="Moderate ×1.6" />
              <Legend c="var(--jam-heavy)" l="Heavy ×2.4" />
              <Legend c="var(--jam-severe)" l="Severe jam ×4" />
              <Legend c="var(--map-blocked)" l="Blocked (click a road)" dashed />
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{jamCount} congested · {blocked.size} blocked</p>
            {blocked.size > 0 && <button className="btn mt-2 w-full text-xs" onClick={() => { cause.current = "all roads reopened"; setBlocked(new Set()); }}>Clear all blocks</button>}
          </Panel>

          {alerts.length > 0 && (
            <Panel title="Route alerts">
              <ul className="space-y-2">
                {alerts.map((a, k) => (
                  <li key={k} className={`rounded border-l-4 px-2 py-1.5 text-xs ${a.kind === "warn" ? "border-accent bg-accent/10" : "border-border bg-muted"}`}>
                    <span className="font-mono text-muted-foreground">{a.t}</span> {a.msg}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>

        <main className="space-y-4">
          <div className="relative h-[560px] overflow-hidden rounded-lg border border-border">
            {alerts[0] && alerts[0].kind === "warn" && (
              <div key={alerts[0].t + alerts[0].msg} className="alert-pop absolute left-1/2 top-3 z-[1000] max-w-[90%] -translate-x-1/2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-lg">
                ⚠ {alerts[0].msg}
              </div>
            )}
            <Suspense fallback={<div className="grid h-full place-items-center text-muted-foreground">Loading map…</div>}>
              <ClientMap
                nodes={nodes} edges={edges} traffic={traffic} blocked={blocked}
                route={best?.edges ?? []} alts={alts.map((a) => a.edges)} ambulance={amb}
                selectedHospital={dest}
                onDrag={(lat, lng) => { cause.current = "ambulance moved"; setAmb({ lat, lng }); }}
                onEdgeClick={toggleBlock}
                onHospitalClick={(i) => { cause.current = "destination change"; setTarget(i); }}
              />
            </Suspense>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {([["nav", "Turn-by-turn & alternatives"], ["rank", "Nearest hospitals"], ["bench", "Algorithm benchmark"]] as const).map(([k, l]) => (                <button key={k} className={`btn text-sm ${tab === k ? "btn-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="p-4">
              {tab === "nav" && (
                <div className="space-y-5">
                  <Table head={["#", "Instruction", "Distance", "Time", "Traffic"]}>
                    {steps.map((s, k) => (
                      <tr key={k} className="border-t border-border">
                        <td className="py-2 pr-3 font-mono text-muted-foreground">{k + 1}</td>
                        <td className="py-2 pr-3">{k === 0 ? "Start" : "Continue"} on <b>{s.road}</b> from {s.from} → {s.to}</td>
                        <td className="py-2 pr-3 font-mono">{s.km.toFixed(2)} km</td>
                        <td className="py-2 pr-3 font-mono">{fmt(s.min)}</td>
                        <td className="py-2"><Jam l={s.jam} /></td>
                      </tr>
                    ))}
                    {best && <tr className="border-t border-border font-semibold"><td /><td className="py-2">🏥 Arrive at {nodes[dest!].name}</td><td /><td className="py-2 font-mono text-primary">{fmt(best.cost)}</td><td /></tr>}
                  </Table>
                  <div>
                    <h3 className="mb-2 font-display font-semibold">Alternative routes</h3>
                    {alts.length === 0 && <p className="text-sm text-muted-foreground">No distinct alternative found.</p>}
                    <div className="grid gap-2 md:grid-cols-2">
                      {alts.map((a, k) => (
                        <div key={k} className="rounded-md border border-border p-3 text-sm">
                          <div className="flex justify-between font-mono"><span>Alt {k + 1}</span><span className="text-[var(--map-alt)]">{fmt(a.cost)} (+{fmt(a.cost - best!.cost)})</span></div>
                          <p className="mt-1 text-xs text-muted-foreground">via {[...new Set(a.edges.map((e) => edges[e].road))].join(" → ")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {tab === "rank" && (
                <Table head={["Rank", "Hospital", "Area", "ETA", ""]}>
                  {ranking.slice(0, 15).map((r, k) => (
                    <tr key={r.i} className={`border-t border-border ${r.i === dest ? "bg-primary/10" : ""}`}>
                      <td className="py-2 pr-3 font-mono">{k + 1}</td>
                      <td className="py-2 pr-3">{nodes[r.i].name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{nodes[r.i].area}</td>
                      <td className="py-2 pr-3 font-mono">{fmt(r.t)}</td>
                      <td className="py-2"><button className="btn text-xs" onClick={() => { cause.current = "destination change"; setTarget(r.i); }}>Route</button></td>
                    </tr>
                  ))}
                </Table>
              )}
              {tab === "bench" && <Benchmark adj={adj} src={src} dest={dest} />}
              {tab === "viva" && <Viva />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ClientMap(props: React.ComponentProps<typeof RouteMap>) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok ? <RouteMap {...props} /> : null;
}

function Benchmark({ adj, src, dest }: { adj: Adj; src: number; dest: number | null }) {
  const [res, setRes] = useState<null | { runs: number; dj: number; dp: number; djOps: ReturnType<typeof dijkstra>["ops"]; dpOps: ReturnType<typeof dpShortest>["ops"]; stages: number; agree: number; pathSame: boolean; costDj: number; costDp: number }>(null);
  const run = () => {
    const runs = 300;
    let t0 = performance.now();
    for (let i = 0; i < runs; i++) dijkstra(adj, src);
    const djT = (performance.now() - t0) / runs;
    t0 = performance.now();
    for (let i = 0; i < runs; i++) dpShortest(adj, src);
    const dpT = (performance.now() - t0) / runs;
    const a = dijkstra(adj, src), b = dpShortest(adj, src);
    const agree = a.dist.filter((d, i) => Math.abs(d - b.dist[i]) < 1e-9 || (d === Infinity && b.dist[i] === Infinity)).length;
    const pa = dest != null ? reconstruct(a, dest) : null, pb = dest != null ? reconstruct(b, dest) : null;
    setRes({ runs, dj: djT, dp: dpT, djOps: a.ops, dpOps: b.ops, stages: b.stages ?? 0, agree, pathSame: pa?.edges.join() === pb?.edges.join(), costDj: pa?.cost ?? Infinity, costDp: pb?.cost ?? Infinity });
  };
  useEffect(run, [adj, src, dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const V = adj.length, E = adj.reduce((s, l) => s + l.length, 0) / 2;
  if (!res) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Graph: <b className="font-mono text-foreground">V = {V}</b>, <b className="font-mono text-foreground">E = {E}</b> (current traffic weights, blocked roads removed). Averaged over {res.runs} runs in your browser.</p>
      <Table head={["Metric", "Dijkstra (min-heap)", "DP shortest path"]}>
        {[
          ["Avg execution time", `${(res.dj * 1000).toFixed(1)} µs`, `${(res.dp * 1000).toFixed(1)} µs`],
          ["Heap push / pop", `${res.djOps.heapPush} / ${res.djOps.heapPop}`, "— (no heap)"],
          ["Edge relaxations (improvements)", res.djOps.relaxations, res.dpOps.relaxations],
          ["Comparisons", res.djOps.comparisons, res.dpOps.comparisons],
          ["Total operations", res.djOps.total, res.dpOps.total],
          ["Stages (k) until convergence", "—", `${res.stages} of max V−1 = ${V - 1}`],
          ["Cost to destination", fmt(res.costDj), fmt(res.costDp)],
          ["Time complexity", "O((V+E) log V)", "O(V·E) worst case"],
          ["Space", "O(V) + heap O(E)", "O(V) rolling rows"],
        ].map((r, k) => (
          <tr key={k} className="border-t border-border"><td className="py-2 pr-3">{r[0]}</td><td className="py-2 pr-3 font-mono">{r[1]}</td><td className="py-2 font-mono">{r[2]}</td></tr>
        ))}
      </Table>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className={`rounded px-2 py-1 font-mono ${res.agree === V ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>Distance agreement: {res.agree}/{V} vertices</span>
        <span className={`rounded px-2 py-1 font-mono ${res.pathSame ? "bg-success/15 text-success" : "bg-accent/15 text-accent"}`}>Path to destination: {res.pathSame ? "identical" : "equal cost, different tie-break"}</span>
        <button className="btn text-xs" onClick={run}>Re-run benchmark</button>
      </div>
    </div>
  );
}

function Viva() {
  const qa: [string, string][] = [
    ["How is Ahmedabad modelled as a graph?", "Vertices = major junctions, hospitals and the ambulance's live position. Edges = road segments (SG Highway, 132 Ft Ring Road, Ashram Road, SP Ring Road…). Edge weight = estimated travel time = distance ÷ road-class speed × traffic multiplier. Blocked roads are removed from the adjacency list."],
    ["Explain Dijkstra's algorithm.", "Greedy: maintain dist[], start with dist[src]=0 in a min-heap. Repeatedly extract the vertex u with the smallest tentative distance (it is final), and relax every edge (u,v): if dist[u]+w < dist[v], set dist[v]=dist[u]+w, prev[v]=u, push v. Path is reconstructed by following prev[] back from the target."],
    ["Why must weights be non-negative for Dijkstra?", "Once a vertex is popped it is never revisited. A negative edge could later produce a shorter path to an already-finalised vertex, breaking the greedy invariant. Travel times are always ≥ 0, so Dijkstra is correct here."],
    ["What is the complexity with a binary heap?", "Each vertex popped once and each edge relaxed at most once per direction: O((V + E) log V). We use lazy deletion (stale heap entries are skipped) instead of decrease-key."],
    ["What is the DP state and recurrence?", "D[k][v] = minimum travel time from the ambulance to v using at most k road segments. Base: D[0][src] = 0, others ∞. Recurrence: D[k][v] = min( D[k−1][v], min over edges (u,v) of D[k−1][u] + w(u,v) ). Answer: D[V−1][hospital]."],
    ["Where are optimal substructure and overlapping subproblems?", "Optimal substructure: any prefix of a shortest path is itself a shortest path (to the intermediate junction). Overlapping subproblems: D[k−1][u] is reused by every neighbour v of u at stage k, and by all later stages — we compute it once in a table instead of recomputing recursively."],
    ["Is Dijkstra a DP algorithm?", "No. Dijkstra is a greedy algorithm (it commits to the locally minimum vertex). Our DP method is stage-based (Bellman–Ford style) and fills a table stage by stage without greedy choice. Both satisfy optimal substructure, but only DP explicitly tabulates subproblems."],
    ["Why is DP useful in this project?", "It verifies Dijkstra's answer independently (the benchmark checks every vertex agrees), handles hop-limited questions (\"best route using at most k segments\"), and would still work if weights could be negative (e.g. incentive/priority lanes)."],
    ["How does recalculation work when a road is blocked?", "Clicking a road removes it from the adjacency list; the weighted graph is rebuilt and Dijkstra re-runs instantly from the current ambulance position. If the path changes, a warning alert is raised with the new ETA."],
    ["How are alternative routes produced?", "For each edge of the best path, temporarily exclude it and re-run Dijkstra; collect distinct resulting paths and show the two cheapest. This is a simplified variant of Yen's k-shortest-paths idea."],
    ["How is the nearest hospital found?", "A single Dijkstra run from the ambulance gives dist[] to every vertex, so all 60 hospitals are ranked by travel time in O((V+E) log V) — not by straight-line distance."],
    ["Limitations?", "Junction network is simplified (straight segments between major junctions), speeds and traffic are simulated, and the ambulance snaps to its 3 nearest junctions. It is an academic demonstration, not a dispatch system."],
  ];
  return (
    <div className="space-y-2">
      {qa.map(([q, a], k) => (
        <details key={k} className="rounded-md border border-border p-3 open:bg-muted/40">
          <summary className="cursor-pointer font-medium"><span className="mr-2 font-mono text-primary">Q{k + 1}</span>{q}</summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </details>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
function Legend({ c, l, dashed }: { c: string; l: string; dashed?: boolean }) {
  return <div className="flex items-center gap-2"><span className="inline-block h-0 w-6 border-t-4" style={{ borderColor: c, borderStyle: dashed ? "dashed" : "solid" }} />{l}</div>;
}
function Jam({ l }: { l: TrafficLevel }) {
  const c = l === "free" ? "var(--success)" : `var(--jam-${l})`;
  return <span className="font-mono text-xs capitalize" style={{ color: c }}>● {l === "free" ? "clear" : l}</span>;
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{head.map((h, i) => <th key={i} className="pb-2 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

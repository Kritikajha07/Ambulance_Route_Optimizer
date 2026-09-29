import { useEffect, useRef } from "react";
import type * as LType from "leaflet";
import type { GEdge, GNode, TrafficLevel } from "@/lib/graph";

export interface MapProps {
  nodes: GNode[];
  edges: GEdge[];
  traffic: Record<number, TrafficLevel>;
  blocked: Set<number>;
  route: number[];
  alts: number[][];
  ambulance: { lat: number; lng: number };
  selectedHospital: number | null;
  onDrag: (lat: number, lng: number) => void;
  onEdgeClick: (id: number) => void;
  onHospitalClick: (idx: number) => void;
}

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export default function RouteMap(p: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof LType | null>(null);
  const map = useRef<LType.Map | null>(null);
  const layer = useRef<LType.LayerGroup | null>(null);
  const amb = useRef<LType.Marker | null>(null);
  const cb = useRef(p);
  cb.current = p;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const Lf = (mod as unknown as { default: typeof LType }).default ?? (mod as unknown as typeof LType);
      L.current = Lf;
      const m = Lf.map(el.current, { zoomControl: true }).setView([23.035, 72.565], 12);
      Lf.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 18,
      }).addTo(m);
      layer.current = Lf.layerGroup().addTo(m);
      const icon = Lf.divIcon({ className: "", html: '<div class="amb-marker">🚑</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
      amb.current = Lf.marker([cb.current.ambulance.lat, cb.current.ambulance.lng], { draggable: true, icon, zIndexOffset: 1000 })
        .addTo(m)
        .bindTooltip("Ambulance (drag me)");
      amb.current.on("dragend", () => {
        const ll = amb.current!.getLatLng();
        cb.current.onDrag(ll.lat, ll.lng);
      });
      map.current = m;
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const Lf = L.current, lg = layer.current;
    if (!Lf || !lg) return;
    const { nodes, edges, traffic, blocked, route, alts, selectedHospital } = cb.current;
    lg.clearLayers();
    const col = {
      road: cssVar("--map-road"), moderate: cssVar("--jam-moderate"), heavy: cssVar("--jam-heavy"),
      severe: cssVar("--jam-severe"), blocked: cssVar("--map-blocked"), route: cssVar("--map-route"),
      alt: cssVar("--map-alt"), hosp: cssVar("--map-hospital"), junc: cssVar("--map-junction"),
    };
    const pt = (i: number): [number, number] => [nodes[i].lat, nodes[i].lng];
    const routeSet = new Set(route);
    alts.forEach((a) =>
      Lf.polyline(a.flatMap((e) => [pt(edges[e].u), pt(edges[e].v)]).length ? [] : [], {}),
    );
    for (const e of edges) {
      const t = traffic[e.id] ?? "free";
      const isB = blocked.has(e.id);
      const color = isB ? col.blocked : t === "free" ? col.road : col[t];
      const line = Lf.polyline([pt(e.u), pt(e.v)], {
        color, weight: isB ? 5 : e.type === "highway" ? 5 : e.type === "access" ? 2 : 3.5,
        opacity: e.type === "access" ? 0.5 : 0.85, dashArray: isB ? "6 6" : undefined,
      }).addTo(lg);
      Lf.polyline([pt(e.u), pt(e.v)], { weight: 16, opacity: 0 })
        .addTo(lg)
        .bindTooltip(`${e.road} · ${e.km.toFixed(1)} km · ${isB ? "BLOCKED" : t}<br/><i>click to ${isB ? "unblock" : "block"}</i>`, { sticky: true })
        .on("click", () => cb.current.onEdgeClick(e.id));
      void line;
    }
    alts.forEach((a) => {
      for (const id of a) {
        if (routeSet.has(id)) continue;
        const e = edges[id];
        Lf.polyline([pt(e.u), pt(e.v)], { color: col.alt, weight: 6, opacity: 0.8, dashArray: "2 8", interactive: false }).addTo(lg);
      }
    });
    for (const id of route) {
      const e = edges[id];
      Lf.polyline([pt(e.u), pt(e.v)], { color: col.route, weight: 8, opacity: 0.95, interactive: false }).addTo(lg);
    }
    nodes.forEach((n, i) => {
      if (n.kind === "junction") {
        Lf.circleMarker([n.lat, n.lng], { radius: 3.5, color: col.junc, fillOpacity: 1, weight: 1 }).addTo(lg).bindTooltip(n.name);
      } else if (n.kind === "hospital") {
        const sel = i === selectedHospital;
        Lf.circleMarker([n.lat, n.lng], { radius: sel ? 10 : 6, color: col.hosp, fillColor: col.hosp, fillOpacity: sel ? 0.9 : 0.55, weight: sel ? 3 : 1.5 })
          .addTo(lg)
          .bindTooltip(`🏥 ${n.name}<br/>${n.area ?? ""}`)
          .on("click", () => cb.current.onHospitalClick(i));
      }
    });
  }

  useEffect(() => {
    draw();
    amb.current?.setLatLng([p.ambulance.lat, p.ambulance.lng]);
  });

  return <div ref={el} className="h-full w-full" />;
}

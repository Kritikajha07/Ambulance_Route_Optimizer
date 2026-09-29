import hospitalsRaw from "./hospitals.json";

export type NodeKind = "junction" | "hospital" | "ambulance";
export interface GNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: NodeKind;
  area?: string;
  contact?: string;
  address?: string;
}
export type RoadType = "highway" | "arterial" | "city" | "access";
export interface GEdge {
  id: number;
  u: number;
  v: number;
  road: string;
  type: RoadType;
  km: number;
  baseMin: number;
}
export type TrafficLevel = "free" | "moderate" | "heavy" | "severe";
export const TRAFFIC_MULT: Record<TrafficLevel, number> = { free: 1, moderate: 1.6, heavy: 2.4, severe: 4 };
export const SPEED_KMH: Record<RoadType, number> = { highway: 45, arterial: 32, city: 22, access: 18 };
const ROAD_FACTOR = 1.25; // straight-line -> road distance approximation

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Major junctions (approximate coordinates)
const J: [string, string, number, number][] = [
  ["sarkhej", "Sarkhej Cross Road", 22.99, 72.499],
  ["prahlad", "Prahlad Nagar", 23.012, 72.51],
  ["iskcon", "ISKCON Cross Road", 23.0258, 72.507],
  ["pakwan", "Pakwan Cross Road", 23.04, 72.512],
  ["thaltej", "Thaltej Cross Road", 23.05, 72.517],
  ["sola", "Sola Overbridge", 23.072, 72.519],
  ["gota", "Gota Cross Road", 23.1, 72.532],
  ["vaishno", "Vaishnodevi Circle", 23.135, 72.541],
  ["bopal", "Bopal Crossroads", 23.033, 72.465],
  ["sbopal", "South Bopal", 23.018, 72.47],
  ["shivranjani", "Shivranjani Cross Road", 23.024, 72.531],
  ["nehrunagar", "Nehru Nagar Circle", 23.024, 72.542],
  ["panjarapole", "Panjarapole Cross Road", 23.033, 72.545],
  ["helmet", "Helmet Circle", 23.047, 72.54],
  ["memnagar", "Memnagar", 23.05, 72.533],
  ["gurukul", "Drive-In / Gurukul", 23.048, 72.527],
  ["incometax", "Income Tax Circle", 23.045, 72.568],
  ["navrangpura", "Navrangpura (CG Road)", 23.037, 72.558],
  ["paldi", "Paldi Cross Road", 23.015, 72.562],
  ["ellis", "Ellisbridge", 23.024, 72.57],
  ["usmanpura", "Usmanpura", 23.058, 72.571],
  ["wadaj", "Wadaj Circle", 23.07, 72.575],
  ["rto", "RTO Circle", 23.08, 72.582],
  ["sabarmati", "Sabarmati", 23.093, 72.585],
  ["chandkheda", "Chandkheda", 23.11, 72.59],
  ["lal", "Lal Darwaja", 23.025, 72.581],
  ["kalupur", "Kalupur Railway Station", 23.027, 72.601],
  ["delhi", "Delhi Darwaja", 23.035, 72.588],
  ["shahibaug", "Shahibaug", 23.055, 72.59],
  ["naroda", "Naroda Patiya", 23.07, 72.655],
  ["bapunagar", "Bapunagar", 23.035, 72.628],
  ["nikol", "Nikol", 23.045, 72.662],
  ["odhav", "Odhav Ring Road", 23.028, 72.66],
  ["maninagar", "Maninagar", 22.998, 72.604],
  ["kankaria", "Kankaria Lake", 23.006, 72.601],
  ["narol", "Narol Circle", 22.965, 72.592],
  ["vasna", "Vasna", 23.0, 72.55],
  ["jivraj", "Jivraj Park", 22.999, 72.532],
  ["vejalpur", "Vejalpur", 23.0, 72.518],
  ["isanpur", "Isanpur", 22.98, 72.595],
  ["ctm", "CTM Cross Road", 23.0, 72.63],
  ["hatkeshwar", "Hatkeshwar Circle", 23.015, 72.625],
  ["shyamal", "Shyamal Cross Road", 23.015, 72.53],
];

const CHAINS: { road: string; type: RoadType; path: string[] }[] = [
  { road: "SG Highway", type: "highway", path: ["sarkhej", "prahlad", "iskcon", "pakwan", "thaltej", "sola", "gota", "vaishno"] },
  { road: "132 Ft Ring Road", type: "arterial", path: ["jivraj", "shyamal", "shivranjani", "helmet", "memnagar", "wadaj"] },
  { road: "Ashram Road", type: "arterial", path: ["paldi", "ellis", "incometax", "usmanpura", "wadaj", "rto", "sabarmati", "chandkheda"] },
  { road: "CG Road", type: "city", path: ["panjarapole", "navrangpura", "incometax"] },
  { road: "Satellite Road", type: "arterial", path: ["iskcon", "shivranjani", "nehrunagar", "panjarapole"] },
  { road: "Drive-In Road", type: "city", path: ["pakwan", "gurukul", "memnagar", "helmet", "navrangpura"] },
  { road: "Ambawadi Road", type: "city", path: ["nehrunagar", "paldi"] },
  { road: "Vejalpur–Vasna Road", type: "city", path: ["prahlad", "vejalpur", "jivraj", "vasna", "paldi"] },
  { road: "Bopal–Ambli Road", type: "arterial", path: ["bopal", "iskcon"] },
  { road: "South Bopal Road", type: "city", path: ["bopal", "sbopal", "sarkhej"] },
  { road: "Sarkhej Road", type: "city", path: ["sarkhej", "vejalpur", "shyamal"] },
  { road: "Ellisbridge", type: "city", path: ["ellis", "lal"] },
  { road: "Sardar Bridge Road", type: "city", path: ["paldi", "kankaria"] },
  { road: "Relief Road", type: "city", path: ["lal", "kalupur"] },
  { road: "Old City Road", type: "city", path: ["lal", "delhi", "shahibaug"] },
  { road: "Gandhi Bridge", type: "city", path: ["delhi", "incometax"] },
  { road: "Subhash Bridge", type: "arterial", path: ["shahibaug", "rto"] },
  { road: "Airport Road", type: "arterial", path: ["shahibaug", "naroda"] },
  { road: "Bapunagar Road", type: "city", path: ["kalupur", "bapunagar", "nikol"] },
  { road: "Naroda Road", type: "arterial", path: ["naroda", "bapunagar"] },
  { road: "Rakhial–Odhav Road", type: "city", path: ["bapunagar", "hatkeshwar", "odhav"] },
  { road: "Kankaria Road", type: "city", path: ["kalupur", "kankaria", "maninagar"] },
  { road: "Maninagar–Narol Road", type: "arterial", path: ["maninagar", "isanpur", "narol"] },
  { road: "CTM Highway", type: "arterial", path: ["maninagar", "ctm", "hatkeshwar", "kankaria"] },
  { road: "SP Ring Road", type: "highway", path: ["sarkhej", "narol", "ctm", "odhav", "nikol", "naroda", "chandkheda", "vaishno"] },
  { road: "Vasna–Narol Road", type: "city", path: ["vasna", "narol"] },
  { road: "Sola–Ranip Road", type: "city", path: ["gota", "rto"] },
  { road: "Science City Road", type: "city", path: ["sola", "memnagar"] },
  { road: "Thaltej–Bopal Road", type: "city", path: ["thaltej", "bopal"] },
];

function buildGraph() {
  const nodes: GNode[] = J.map(([id, name, lat, lng]) => ({ id, name, lat, lng, kind: "junction" as const }));
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges: GEdge[] = [];
  const addEdge = (u: number, v: number, road: string, type: RoadType) => {
    const km = haversine(nodes[u].lat, nodes[u].lng, nodes[v].lat, nodes[v].lng) * ROAD_FACTOR;
    edges.push({ id: edges.length, u, v, road, type, km, baseMin: (km / SPEED_KMH[type]) * 60 });
  };
  for (const c of CHAINS)
    for (let i = 0; i + 1 < c.path.length; i++) addEdge(idx.get(c.path[i])!, idx.get(c.path[i + 1])!, c.road, c.type);
  const junctionCount = nodes.length;
  const hospitalIdx: number[] = [];
  for (const h of hospitalsRaw as { id: string; name: string; lat: number; lng: number; area: string; contact: string; address: string }[]) {
    const hi = nodes.length;
    nodes.push({ ...h, kind: "hospital" });
    hospitalIdx.push(hi);
    nearestJunctions(nodes, junctionCount, h.lat, h.lng, 2).forEach((j) =>
      addEdge(hi, j, `Access road (${h.area})`, "access"),
    );
  }
  return { nodes, edges, junctionCount, hospitalIdx };
}

function nearestJunctions(nodes: GNode[], jc: number, lat: number, lng: number, k: number) {
  return nodes
    .slice(0, jc)
    .map((n, i) => ({ i, d: haversine(lat, lng, n.lat, n.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.i);
}

export const GRAPH = buildGraph();

/** Virtual edges connecting the live ambulance position (node index = nodes.length) to the 3 nearest junctions. */
export function ambulanceEdges(lat: number, lng: number): GEdge[] {
  const a = GRAPH.nodes.length;
  return nearestJunctions(GRAPH.nodes, GRAPH.junctionCount, lat, lng, 3).map((j, k) => {
    const n = GRAPH.nodes[j];
    const km = haversine(lat, lng, n.lat, n.lng) * ROAD_FACTOR;
    return { id: GRAPH.edges.length + k, u: a, v: j, road: "Local street", type: "access" as const, km, baseMin: (km / SPEED_KMH.access) * 60 };
  });
}

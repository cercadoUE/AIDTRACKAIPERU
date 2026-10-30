"use client";
import * as React from "react";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, Polyline } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Feature, FeatureCollection } from "geojson";
import { LEVELS } from "@/lib/format";
import { withBase } from "@/lib/base-path";

export interface MapShelter {
  id: string; name: string; lat: number; lng: number; department: string; departmentCode: string; level: keyof typeof LEVELS; index: number | null;
  simulated: boolean; verified: boolean; occupants: number;
}
export interface MapCenter { id: string; name: string; lat: number; lng: number; kind: string; simulated: boolean }
export interface DeptStat { code: string; name: string; avgIndex: number | null; shelters: number }

const icons = new Map<string, L.DivIcon>();
function iconFor(s: MapShelter, selected: boolean) {
  const key = `${s.level}-${s.simulated}-${s.verified}-${selected}`;
  if (!icons.has(key)) {
    const c = LEVELS[s.level].color;
    // Simulado = borde discontinuo y centro vacío; verificado = anillo doble.
    const style = s.simulated ? `border:3px dashed #fff;background:${c};` : s.verified ? `border:3px solid #fff;box-shadow:0 0 0 2px ${c};background:${c};` : `border:3px solid #fff;background:${c};`;
    icons.set(key, L.divIcon({ className: "", iconSize: [26, 26], html: `<div style="width:26px;height:26px;border-radius:9999px;${style}${selected ? "transform:scale(1.35);outline:3px solid #1677ff;" : ""}box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>` }));
  }
  return icons.get(key)!;
}
const centerIcon = (kind: string) => L.divIcon({ className: "", iconSize: [24, 24], html: `<div style="width:24px;height:24px;background:#0a2a5e;color:#fff;border:2px solid #fff;border-radius:6px;display:grid;place-items:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${kind === "almacen" ? "▣" : "⬢"}</div>` });

function deptColor(avg: number | null) {
  if (avg === null) return "#adb5bd";
  return avg >= 75 ? LEVELS.critical.color : avg >= 55 ? LEVELS.high.color : avg >= 35 ? LEVELS.moderate.color : LEVELS.low.color;
}

export default function ShelterMap({ shelters, centers, depts, selectedDept, selectedId, onDept, onShelter, showCenters, routeFrom, height = "70vh" }: {
  shelters: MapShelter[]; centers: MapCenter[]; depts: DeptStat[]; selectedDept?: string | null; selectedId?: string | null;
  onDept?: (code: string) => void; onShelter?: (id: string) => void; showCenters?: boolean; routeFrom?: boolean; height?: string;
}) {
  const [geo, setGeo] = React.useState<FeatureCollection | null>(null);
  React.useEffect(() => { fetch(withBase("/geo/peru-departamentos.geojson")).then((r) => r.json()).then(setGeo).catch(() => setGeo(null)); }, []);
  const byCode = React.useMemo(() => new Map(depts.map((d) => [d.code, d])), [depts]);

  // Rutas SIMULADAS de distribución: centro más cercano → albergues críticos/altos (línea recta, no ruta real).
  const routes = React.useMemo(() => {
    if (!routeFrom) return [];
    const out: [number, number][][] = [];
    for (const s of shelters.filter((x) => x.level === "critical")) {
      let best: MapCenter | null = null; let bd = Infinity;
      for (const c of centers) { const d = (c.lat - s.lat) ** 2 + (c.lng - s.lng) ** 2; if (d < bd) { bd = d; best = c; } }
      if (best) out.push([[best.lat, best.lng], [s.lat, s.lng]]);
    }
    return out;
  }, [routeFrom, shelters, centers]);

  return (
    <MapContainer center={[-9.5, -75.0]} zoom={5} minZoom={4} style={{ height, width: "100%", borderRadius: 16 }} scrollWheelZoom aria-label="Mapa del Perú con albergues">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {geo && (
        <GeoJSON key={`${depts.length}-${selectedDept}`} data={geo}
          style={(f?: Feature) => {
            const code = String(f?.properties?.FIRST_IDDP);
            const d = byCode.get(code);
            return { color: selectedDept === code ? "#1677ff" : "#44546a", weight: selectedDept === code ? 3 : 1, fillColor: deptColor(d?.avgIndex ?? null), fillOpacity: d ? 0.28 : 0.06 };
          }}
          onEachFeature={(f, layer) => {
            const code = String(f.properties?.FIRST_IDDP);
            layer.on("click", () => onDept?.(code));
            layer.bindTooltip(String(f.properties?.NOMBDEP), { sticky: true });
          }} />
      )}
      <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
        {shelters.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={iconFor(s, selectedId === s.id)} eventHandlers={{ click: () => onShelter?.(s.id) }} keyboard>
            <Tooltip>{s.name}{s.simulated ? " (SIMULADO)" : ""} · {LEVELS[s.level].label}</Tooltip>
          </Marker>
        ))}
      </MarkerClusterGroup>
      {showCenters && centers.map((c) => <Marker key={c.id} position={[c.lat, c.lng]} icon={centerIcon(c.kind)}><Tooltip>{c.name}{c.simulated ? " (SIMULADO)" : ""}</Tooltip></Marker>)}
      {routes.map((r, i) => <Polyline key={i} positions={r} pathOptions={{ color: "#e03131", weight: 2, dashArray: "6 6", opacity: 0.8 }} />)}
    </MapContainer>
  );
}

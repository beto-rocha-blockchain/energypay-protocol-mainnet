// Client-only component — imported exclusively via React.lazy() in grid.tsx
// Never rendered during SSR. All Leaflet code is safe here.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Tooltip,
  Polyline,
  useMap,
} from "react-leaflet";
import type { GridNode } from "@/store/grid";
import { ROLE_META } from "@/store/operator";

// ── Color maps ────────────────────────────────────────────────────────────────
// Keep in sync with ROLE_COLORS.hex in src/store/operator.ts
const ROLE_COLOR: Record<string, string> = {
  GENERATOR:            "#f87171", // red-400
  SELLER:               "#38bdf8", // sky-400
  INVESTOR:             "#facc15", // yellow-400
  USER:                 "#4ade80", // green-400  (Consumer)
  UTILITY:              "#fb923c", // orange-400
  REGULATORY_AUTHORITY: "#a78bfa", // violet-400
};

/** Status overrides all role colors when set. */
const STATUS_COLOR: Record<string, string | null> = {
  ACTIVE:   null,
  DEGRADED: "#f59e0b",
  OFFLINE:  "#ef4444",
};

const STATUS_OPACITY: Record<string, number> = {
  ACTIVE:   0.9,
  DEGRADED: 0.55,
  OFFLINE:  0.3,
};

// ── Multi-color icon factory ──────────────────────────────────────────────────

/**
 * Build a CSS conic-gradient for N role colors.
 * Single color → plain hex string (no gradient wrapper).
 */
function roleBackground(hexColors: string[]): string {
  if (hexColors.length === 1) return hexColors[0];
  const step = 100 / hexColors.length;
  const stops = hexColors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(", ");
  return `conic-gradient(${stops})`;
}

/**
 * Create a Leaflet DivIcon for a participant node.
 * Supports multi-role conic-gradient fills and DEGRADED/OFFLINE status tint.
 */
function makeNodeIcon(
  roles: string[],
  status: string,
  isSelected: boolean,
): L.DivIcon {
  const size = isSelected ? 22 : 14;
  const half = size / 2;
  const opacity = STATUS_OPACITY[status] ?? 0.9;
  const overrideColor = STATUS_COLOR[status];
  const bg = overrideColor
    ? overrideColor
    : roleBackground(roles.map((r) => ROLE_COLOR[r] ?? "#94a3b8"));
  const border = isSelected
    ? "2.5px solid rgba(255,255,255,0.9)"
    : "1.5px solid rgba(0,0,0,0.35)";
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border};opacity:${opacity};box-sizing:border-box;cursor:pointer;"></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [half, half],
    tooltipAnchor: [0, -(half + 2)],
  });
}

// ── AutoBounds ────────────────────────────────────────────────────────────────
/** Fits the map to all markers once, on first render with data. */
function AutoBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 9, { animate: false });
    } else {
      try {
        map.fitBounds(points, { padding: [55, 55], maxZoom: 11, animate: false });
      } catch {
        map.setView([-14.235, -51.925], 4, { animate: false });
      }
    }
  }, [map, points]);

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  nodes: GridNode[];
  operatorCoords: { lat: number; lng: number } | null;
  operatorName: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function GridMapLeaflet({
  nodes,
  operatorCoords,
  operatorName,
  selectedId,
  onSelect,
}: Props) {
  const opPos: [number, number] | null = operatorCoords
    ? [operatorCoords.lat, operatorCoords.lng]
    : null;

  // All points used for auto-fitting viewport
  const allPoints: [number, number][] = [
    ...nodes.map((n) => [n.coords.lat, n.coords.lng] as [number, number]),
    ...(opPos ? [opPos] : []),
  ];

  // Build connection lines only for the currently selected node
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const connectionLines: Array<[[number, number], [number, number]]> = selectedNode
    ? selectedNode.connections
        .map((cid) => nodes.find((n) => n.id === cid))
        .filter((p): p is GridNode => !!p)
        .map((peer) => [
          [selectedNode.coords.lat, selectedNode.coords.lng],
          [peer.coords.lat, peer.coords.lng],
        ])
    : [];

  // Connection line color = primary role color of the selected node
  const connLineColor = selectedNode
    ? (ROLE_COLOR[selectedNode.roles[0]] ?? "#94a3b8")
    : "#94a3b8";

  return (
    <MapContainer
      center={opPos ?? [-14.235, -51.925]}
      zoom={4}
      style={{ height: "100%", width: "100%" }}
      zoomControl
    >
      {/* CartoDB Dark Matter tiles — free, no API key needed */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      <AutoBounds points={allPoints} />

      {/* Dashed connection lines to peers of selected node */}
      {connectionLines.map(([a, b], i) => (
        <Polyline
          key={i}
          positions={[a, b]}
          color={connLineColor}
          weight={1.5}
          opacity={0.5}
          dashArray="5 5"
        />
      ))}

      {/* Participant markers — multi-color divIcon */}
      {nodes.map((n) => {
        const isSelected = n.id === selectedId;
        const icon = makeNodeIcon(n.roles, n.status, isSelected);

        // Tooltip role labels
        const roleLabels = n.roles
          .map((r) => ROLE_META[r]?.label ?? r)
          .join(" · ");

        return (
          <Marker
            key={n.id}
            position={[n.coords.lat, n.coords.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(n.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <div>
                <strong
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#e2e8f0",
                    display: "block",
                  }}
                >
                  {n.organization.slice(0, 26)}
                </strong>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "10px",
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {roleLabels} · {n.region}
                  {n.approximateLocation ? " · ~approx" : ""}
                </span>
              </div>
            </Tooltip>
          </Marker>
        );
      })}

      {/* Operator "YOU" marker — cyan, permanent label */}
      {opPos && (
        <CircleMarker
          center={opPos}
          radius={10}
          fillColor="#06b6d4"
          fillOpacity={0.92}
          color="#ffffff"
          weight={2.5}
        >
          <Tooltip direction="top" offset={[0, -12]} permanent opacity={1}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#06b6d4",
                fontWeight: "bold",
              }}
            >
              YOU · {(operatorName || "").slice(0, 16)}
            </span>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

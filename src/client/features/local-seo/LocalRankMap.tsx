import {
  CircleMarker,
  MapContainer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { LocalPointStatus } from "@/shared/local-seo";
import { GoogleMapsTiles } from "./GoogleMapsTiles";
import type { LocalGridDisplayPoint } from "./LocalRankGrid";

const GRID_PADDING = { padding: [38, 38] as [number, number] };

/** Keeps the whole grid in view when the map's container changes size. */
function FitGridOnResize({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useMapEvents({ resize: () => map.fitBounds(bounds, GRID_PADDING) });
  return null;
}

export default function LocalRankMap({
  projectId,
  points,
  selectedPointId,
  onSelect,
  preview,
}: {
  projectId: string;
  points: LocalGridDisplayPoint[];
  selectedPointId?: string;
  onSelect: (id: string) => void;
  preview: boolean;
}) {
  const bounds: LatLngBoundsExpression = points.map((point) => [
    point.latitude,
    point.longitude,
  ]);
  return (
    // The view is fixed to the grid: no panning or zooming.
    <MapContainer
      bounds={bounds}
      boundsOptions={GRID_PADDING}
      dragging={false}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      attributionControl={false}
      className="z-0 h-full w-full"
      aria-label="Local search ranking grid on a Google Maps basemap"
    >
      <FitGridOnResize bounds={bounds} />
      <GoogleMapsTiles projectId={projectId} />
      {points.map((point) => {
        const color =
          point.status !== LocalPointStatus.Completed || point.rank == null
            ? "#64748b"
            : point.rank <= 3
              ? "#16a34a"
              : point.rank <= 10
                ? "#d97706"
                : "#dc2626";
        const label = preview
          ? "·"
          : point.status === LocalPointStatus.Pending
            ? "…"
            : point.status === LocalPointStatus.Failed
              ? "!"
              : (point.rank ?? "–");
        return (
          <CircleMarker
            key={point.id}
            center={[point.latitude, point.longitude]}
            radius={19}
            pathOptions={{
              fillColor: color,
              fillOpacity: 1,
              color: selectedPointId === point.id ? "#0f172a" : "#ffffff",
              weight: selectedPointId === point.id ? 4 : 2,
            }}
            eventHandlers={{ click: () => onSelect(point.id) }}
          >
            <Tooltip
              permanent
              direction="center"
              className="local-rank-label"
              opacity={1}
            >
              {label}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

import { useRef } from "react";
import { divIcon, type LatLng, type Marker as LeafletMarker } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  useMapEvents,
} from "react-leaflet";
import { buildLocalGrid } from "@/shared/local-seo";
import { GoogleMapsTiles } from "./GoogleMapsTiles";

export type LocalCenter = { latitude: number; longitude: number };

const centerIcon = divIcon({
  className: "local-grid-center",
  iconSize: [22, 22],
});

function toCenter(latLng: LatLng): LocalCenter {
  const { lat, lng } = latLng.wrap();
  return {
    latitude: Number(lat.toFixed(7)),
    longitude: Number(lng.toFixed(7)),
  };
}

function MoveOnClick({ onMove }: { onMove: (center: LocalCenter) => void }) {
  useMapEvents({ click: (event) => onMove(toCenter(event.latlng)) });
  return null;
}

/**
 * The points a tracker will search, with a center pin to drag. A click on the
 * map moves the center there. The view fits the grid when the map mounts, so
 * remount it to refit after the area changes.
 */
export default function LocalCenterMap({
  projectId,
  center,
  gridSize,
  spacingKm,
  onCenterChange,
}: {
  projectId: string;
  center: LocalCenter;
  gridSize: number;
  spacingKm: number;
  onCenterChange: (center: LocalCenter) => void;
}) {
  const marker = useRef<LeafletMarker>(null);
  const points = buildLocalGrid(center, gridSize, spacingKm);
  return (
    <MapContainer
      bounds={points.map((point) => [point.latitude, point.longitude])}
      boundsOptions={{ padding: [28, 28] }}
      scrollWheelZoom={false}
      attributionControl={false}
      className="z-0 h-full w-full"
      aria-label="Grid center on a Google Maps basemap"
    >
      <GoogleMapsTiles projectId={projectId} />
      <MoveOnClick onMove={onCenterChange} />
      {points.map((point) => (
        <CircleMarker
          key={`${point.row}-${point.col}`}
          center={[point.latitude, point.longitude]}
          radius={7}
          interactive={false}
          pathOptions={{
            fillColor: "#2563eb",
            fillOpacity: 0.9,
            color: "#ffffff",
            weight: 2,
          }}
        />
      ))}
      <Marker
        ref={marker}
        position={[center.latitude, center.longitude]}
        icon={centerIcon}
        draggable
        title="Grid center"
        eventHandlers={{
          dragend: () => {
            if (marker.current)
              onCenterChange(toCenter(marker.current.getLatLng()));
          },
        }}
      />
    </MapContainer>
  );
}

import { CircleMarker, MapContainer, Tooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { GoogleMapsTiles } from "./GoogleMapsTiles";
import type { Listing } from "./LocalListingChoices";

/** The listings a lookup found as numbered pins; a click picks one. */
export default function LocalListingMap({
  projectId,
  listings,
  selected,
  onSelectedChange,
}: {
  projectId: string;
  listings: Listing[];
  selected: number;
  onSelectedChange: (index: number) => void;
}) {
  const bounds: LatLngBoundsExpression = listings.map(({ business }) => [
    business.latitude,
    business.longitude,
  ]);
  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [28, 28], maxZoom: 15 }}
      scrollWheelZoom={false}
      attributionControl={false}
      className="z-0 h-full w-full"
      aria-label="Matching listings on a Google Maps basemap"
    >
      <GoogleMapsTiles projectId={projectId} />
      {listings.map(({ business }, index) => (
        <CircleMarker
          key={business.cid ?? business.placeId ?? index}
          center={[business.latitude, business.longitude]}
          radius={13}
          pathOptions={{
            fillColor: index === selected ? "#2563eb" : "#64748b",
            fillOpacity: 1,
            color: index === selected ? "#0f172a" : "#ffffff",
            weight: index === selected ? 3 : 2,
          }}
          eventHandlers={{ click: () => onSelectedChange(index) }}
        >
          <Tooltip
            permanent
            direction="center"
            className="local-rank-label"
            opacity={1}
          >
            {index + 1}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

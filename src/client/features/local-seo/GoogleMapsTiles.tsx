import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Map } from "leaflet";
import { TileLayer, useMap, useMapEvents } from "react-leaflet";
import { QueryError } from "@/client/components/QueryState";
import { getLocalMapCopyright } from "@/serverFunctions/google-maps";
import type { GoogleMapsViewport } from "@/types/schemas/google-maps";
import googleMapsLogo from "./google-maps-logo.svg";

function readViewport(map: Map): GoogleMapsViewport {
  const bounds = map.getBounds();
  const southWest = map.wrapLatLng(bounds.getSouthWest());
  const northEast = map.wrapLatLng(bounds.getNorthEast());
  return {
    zoom: map.getZoom(),
    north: Math.min(85.0511287798, northEast.lat),
    south: Math.max(-85.0511287798, southWest.lat),
    east: northEast.lng,
    west: southWest.lng,
  };
}

export function GoogleMapsTiles({ projectId }: { projectId: string }) {
  const map = useMap();
  const [viewport, setViewport] = useState(() => readViewport(map));
  // The map only moves when its container resizes and the grid is refitted.
  useMapEvents({ moveend: () => setViewport(readViewport(map)) });
  const copyright = useQuery({
    queryKey: ["localSeo", projectId, "map-copyright", viewport],
    queryFn: () => getLocalMapCopyright({ data: { projectId, viewport } }),
    // Copyright is used only for the current viewport; do not retain old views,
    // but keep showing the last one so the tiles stay mounted while it loads.
    gcTime: 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (copyright.isError) {
    return (
      <div className="absolute inset-x-4 top-4 z-[1000]">
        <QueryError
          error={copyright.error}
          title="Google Maps unavailable"
          fallback="Map tiles could not load. Check the map key's access and quota, or view rankings in Points."
          onRetry={() => void copyright.refetch()}
          isRetrying={copyright.isFetching}
        />
      </div>
    );
  }
  if (copyright.isPending) {
    return (
      <div
        role="status"
        className="absolute inset-x-0 top-4 z-[1000] text-center text-sm"
      >
        Loading Google Maps…
      </div>
    );
  }

  return (
    <>
      <TileLayer
        url={`/api/local-seo/maps/${encodeURIComponent(projectId)}/{z}/{x}/{y}`}
        maxZoom={22}
      />
      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control local-google-maps-logo">
          <img src={googleMapsLogo} alt="Google Maps" />
        </div>
      </div>
      <div className="leaflet-bottom leaflet-right local-google-maps-attribution">
        <div className="leaflet-control local-google-maps-copyright">
          {copyright.data}
        </div>
      </div>
    </>
  );
}

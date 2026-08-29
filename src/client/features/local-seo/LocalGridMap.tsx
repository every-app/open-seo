import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { LocalGridResultCell } from "@/types/schemas/local-seo";
import {
  localGridCellLabel,
  localGridMarkerStyle,
} from "./localGridResultUtils";

interface LocalGridMapProps {
  cells: LocalGridResultCell[];
  gridSize: number;
  onSelect: (resultId: string) => void;
}

export function LocalGridMap({ cells, gridSize, onSelect }: LocalGridMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || cells.length === 0) return;

    let disposed = false;
    let map: LeafletMap | null = null;
    setLoadFailed(false);

    void import("leaflet")
      .then(({ default: L }) => {
        if (disposed) return;

        map = L.map(container, {
          attributionControl: true,
          scrollWheelZoom: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const radius = gridSize <= 3 ? 19 : gridSize <= 7 ? 15 : 12;
        for (const cell of cells) {
          const appearance = localGridMarkerStyle(cell);
          const marker = L.circleMarker([cell.latitude, cell.longitude], {
            radius,
            color: appearance.color,
            fillColor: appearance.color,
            fillOpacity: 0.96,
            opacity: 1,
            weight: 2,
          }).addTo(map);
          marker.bindTooltip(appearance.label, {
            className: `local-grid-rank-label${appearance.darkText ? " local-grid-rank-label-dark" : ""}`,
            direction: "center",
            permanent: true,
          });
          marker.bindPopup(
            `<strong>${localGridCellLabel(cell)}</strong><br>Row ${cell.rowIndex + 1}, column ${cell.columnIndex + 1}`,
          );
          marker.on("click", () => onSelect(cell.resultId));
        }

        const bounds = L.latLngBounds(
          cells.map((cell) => [cell.latitude, cell.longitude]),
        );
        map.fitBounds(bounds.pad(0.08), {
          animate: false,
          maxZoom: 15,
          padding: [28, 28],
        });
        requestAnimationFrame(() => map?.invalidateSize());
      })
      .catch(() => {
        if (!disposed) setLoadFailed(true);
      });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [cells, gridSize, onSelect]);

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        ref={containerRef}
        className="h-[34rem] min-h-96 w-full bg-base-200"
        aria-label="Local ranking map grid"
      />
      {loadFailed ? (
        <p className="absolute inset-x-4 top-4 rounded-lg bg-error p-3 text-sm text-error-content shadow">
          The background map could not be loaded. Grid results remain available
          below.
        </p>
      ) : null}
    </div>
  );
}

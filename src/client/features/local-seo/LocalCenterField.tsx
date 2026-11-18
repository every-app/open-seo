import { lazy, Suspense } from "react";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import type { LocalCenter } from "./LocalCenterMap";

const CenterMap = lazy(() => import("./LocalCenterMap"));

/** Where the grid is centered, moved by dragging its pin or clicking the map. */
export function LocalCenterField({
  projectId,
  center,
  grid,
  onChange,
  note,
}: {
  projectId: string;
  center: LocalCenter;
  grid: { gridSize: number; spacingKm: number };
  onChange: (center: LocalCenter) => void;
  /** A second line under the instructions. */
  note?: string;
}) {
  return (
    <Field>
      <FieldLabel>Grid center</FieldLabel>
      <div className="h-64 overflow-hidden rounded-lg border border-border">
        <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
          <CenterMap
            // Refit the view when the area changes; moving the center keeps it.
            key={`${grid.gridSize}-${grid.spacingKm}`}
            projectId={projectId}
            center={center}
            gridSize={grid.gridSize}
            spacingKm={grid.spacingKm}
            onCenterChange={onChange}
          />
        </Suspense>
      </div>
      <FieldDescription>
        Drag the pin or click the map to move the grid.
      </FieldDescription>
      {note && <FieldDescription>{note}</FieldDescription>}
    </Field>
  );
}

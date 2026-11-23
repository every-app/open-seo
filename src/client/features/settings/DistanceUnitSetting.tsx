import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { setDistanceUnit } from "@/serverFunctions/distance-unit";
import { DistanceUnit } from "@/shared/distance-unit";
import { distanceUnitQueryOptions } from "./distanceUnitQueries";

const UNIT_OPTIONS = [
  { value: DistanceUnit.Mi, icon: null, label: "Miles" },
  { value: DistanceUnit.Km, icon: null, label: "Kilometers" },
];

export function DistanceUnitSetting() {
  const queryClient = useQueryClient();
  const query = useQuery(distanceUnitQueryOptions());
  const save = useMutation({
    mutationFn: (unit: DistanceUnit) => setDistanceUnit({ data: { unit } }),
    onSuccess: (_, unit) => {
      queryClient.setQueryData(distanceUnitQueryOptions().queryKey, unit);
      toast.success(
        `Distances now show in ${unit === DistanceUnit.Mi ? "miles" : "kilometers"}`,
      );
    },
    onError: () => toast.error("We couldn't save your distance unit."),
  });
  if (!query.data) return null;

  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-sm">Distances</span>
      <SegmentedToggle
        showLabels
        items={UNIT_OPTIONS}
        value={save.isPending ? save.variables : query.data}
        disabled={save.isPending}
        onChange={(unit) => save.mutate(unit)}
      />
    </div>
  );
}

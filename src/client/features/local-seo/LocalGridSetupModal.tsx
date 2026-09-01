import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import type { ProjectMarket } from "@/client/features/projects/types";
import { useProjectMarket } from "@/client/features/projects/useProjectMarket";
import { createLocalGridConfig } from "@/serverFunctions/local-seo";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import { estimateLocalGridCost } from "@/shared/local-seo";

function parseGridSize(value: string): 3 | 5 | 7 {
  const parsed = Number(value);
  return parsed === 3 || parsed === 5 || parsed === 7 ? parsed : 7;
}

type Props = {
  projectId: string;
  onClose: () => void;
  onSaved: (configId: string) => void;
};

export function LocalGridSetupModal(props: Props) {
  const projectMarket = useProjectMarket(props.projectId);
  if (!projectMarket) {
    return (
      <Modal
        maxWidth="max-w-2xl"
        onClose={props.onClose}
        labelledBy="local-grid-setup-loading-title"
      >
        <h2 id="local-grid-setup-loading-title" className="sr-only">
          Loading project market
        </h2>
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-base-content/50" />
        </div>
      </Modal>
    );
  }
  return (
    <LocalGridSetupModalContent {...props} projectMarket={projectMarket} />
  );
}

function LocalGridSetupModalContent({
  projectId,
  onClose,
  onSaved,
  projectMarket,
}: Props & { projectMarket: ProjectMarket }) {
  const countryCode = getIsoCountryCode(projectMarket.locationCode);
  const distanceUnit =
    countryCode === "gb" || countryCode === "us" ? "mi" : "km";
  const metersPerUnit = distanceUnit === "mi" ? 1_609.344 : 1_000;
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [gridSize, setGridSize] = useState<3 | 5 | 7>(7);
  const [radius, setRadius] = useState("3");
  const [searchDepth, setSearchDepth] = useState(20);
  const keywords = useMemo(
    () =>
      keywordsText
        .split(/\n|,/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    [keywordsText],
  );
  const estimate = estimateLocalGridCost({
    gridSize,
    keywordCount: new Set(keywords.map((keyword) => keyword.toLowerCase()))
      .size,
    searchDepth,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const parsedLatitude = Number(latitude);
      const parsedLongitude = Number(longitude);
      const parsedRadius = Number(radius);
      if (
        !name.trim() ||
        !businessName.trim() ||
        !placeId.trim() ||
        !Number.isFinite(parsedLatitude) ||
        !Number.isFinite(parsedLongitude) ||
        !Number.isFinite(parsedRadius) ||
        parsedRadius <= 0 ||
        keywords.length === 0
      ) {
        throw new Error("Complete all fields and add at least one keyword");
      }

      return createLocalGridConfig({
        data: {
          projectId,
          business: {
            placeId: placeId.trim(),
            name: businessName.trim(),
            latitude: parsedLatitude,
            longitude: parsedLongitude,
          },
          name: name.trim(),
          gridSize,
          radiusMeters: Math.round(parsedRadius * metersPerUnit),
          distanceUnit,
          seDomain: null,
          searchDepth,
          searchPlaces: false,
          scheduleInterval: "manual",
          keywords,
        },
      });
    },
    onSuccess: ({ configId }) => {
      toast.success("Map grid configuration saved");
      onSaved(configId);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Modal
      maxWidth="max-w-2xl"
      onClose={onClose}
      labelledBy="local-grid-setup-title"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 id="local-grid-setup-title" className="text-lg font-semibold">
            Add map grid
          </h2>
          <p className="text-xs text-base-content/60">
            Saving this form does not run a scan or call DataForSEO.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="form-control sm:col-span-2">
          <span className="label-text mb-1 text-sm">Configuration name</span>
          <input
            className="input input-bordered w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Worthing core area"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Business name</span>
          <input
            className="input input-bordered w-full"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="Worthing Loft Conversions"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Google place ID</span>
          <input
            className="input input-bordered w-full"
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
            placeholder="ChIJ…"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Latitude</span>
          <input
            className="input input-bordered w-full"
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="50.8179"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Longitude</span>
          <input
            className="input input-bordered w-full"
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="-0.3729"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Grid size</span>
          <select
            className="select select-bordered w-full"
            value={gridSize}
            onChange={(event) => setGridSize(parseGridSize(event.target.value))}
          >
            <option value={3}>3×3</option>
            <option value={5}>5×5</option>
            <option value={7}>7×7</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">
            Radius ({distanceUnit === "mi" ? "miles" : "kilometres"})
          </span>
          <input
            className="input input-bordered w-full"
            inputMode="decimal"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Search depth</span>
          <select
            className="select select-bordered w-full"
            value={searchDepth}
            onChange={(event) => setSearchDepth(Number(event.target.value))}
          >
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={40}>Top 40</option>
          </select>
        </label>
        <div className="rounded-lg border border-base-300 p-3 text-xs">
          <span className="font-medium">Scan mode:</span> Manual
          <p className="mt-1 text-base-content/60">
            Saving never starts a scan. You approve each run and its estimate.
          </p>
        </div>
        <label className="form-control sm:col-span-2">
          <span className="label-text mb-1 text-sm">
            Keywords (one per line or comma-separated)
          </span>
          <textarea
            className="textarea textarea-bordered min-h-24 w-full"
            value={keywordsText}
            onChange={(event) => setKeywordsText(event.target.value)}
            placeholder={"loft conversions\nloft company"}
          />
        </label>

        <div className="rounded-lg bg-base-200 p-3 text-xs sm:col-span-2">
          <span className="font-medium">Cost preview:</span>{" "}
          {estimate.taskCount} queued tasks · raw $
          {estimate.rawCostUsd.toFixed(5)} · hosted $
          {estimate.hostedCostUsd.toFixed(5)}
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary gap-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save configuration
          </button>
        </div>
      </form>
    </Modal>
  );
}

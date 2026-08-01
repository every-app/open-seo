import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Map, Plus, Trash2, Play, Compass, Target } from "lucide-react";
import {
  getGeoGridConfigs,
  createGeoGridConfig,
  addGeoGridKeywords,
  removeGeoGridKeywords,
  triggerGeoGridCheck,
  getGeoGridLatestResults,
} from "@/serverFunctions/geo-grid";

type GeoGridSnapshot = {
  id: number;
  runId: string;
  keywordId: string;
  keyword: string;
  gridX: number;
  gridY: number;
  latitude: number;
  longitude: number;
  position: number | null;
  checkedAt: string;
};

type GeoGridConfig = {
  id: string;
  businessName: string;
  latitude: number;
  longitude: number;
  gridSize: number;
  gridSpacing: number;
  languageCode: string;
  scheduleInterval: string;
  isActive: number;
  lastCheckedAt: string | null;
  createdAt: string;
};

type GeoGridKeyword = {
  id: string;
  configId: string;
  keyword: string;
  createdAt: string;
};

type Props = {
  projectId: string;
};

export function GeoGridPage({ projectId }: Props) {
  const queryClient = useQueryClient();
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(
    null,
  );

  // Setup form state
  const [businessName, setBusinessName] = useState("");
  const [latitude, setLatitude] = useState<number>(37.7749);
  const [longitude, setLongitude] = useState<number>(-122.4194);
  const [gridSize, setGridSize] = useState<number>(3);
  const [gridSpacing, setGridSpacing] = useState<number>(1.0);
  const [newKeywordInput, setNewKeywordInput] = useState("");

  // Queries
  const { data: configs, isLoading: isConfigsLoading } = useQuery({
    queryKey: ["geoGridConfigs", projectId],
    queryFn: () => getGeoGridConfigs({ data: { projectId } }),
  });

  const activeConfigId = selectedConfigId || configs?.[0]?.id || null;

  const { data: results } = useQuery({
    queryKey: ["geoGridResults", activeConfigId],
    queryFn: () =>
      getGeoGridLatestResults({
        data: { configId: activeConfigId!, projectId },
      }),
    enabled: !!activeConfigId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.latestRun?.status;
      if (status === "pending" || status === "running") {
        return 3000;
      }
      return false;
    },
  });

  // Mutations
  const createConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof createGeoGridConfig>[0]["data"]) =>
      createGeoGridConfig({ data }),
    onSuccess: (res) => {
      toast.success("Geo Grid tracker created!");
      void queryClient.invalidateQueries({
        queryKey: ["geoGridConfigs", projectId],
      });
      setSelectedConfigId(res.configId);
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to create tracker",
      );
    },
  });

  const addKeywordsMutation = useMutation({
    mutationFn: (data: { configId: string; keywords: string[] }) =>
      addGeoGridKeywords({
        data: { projectId, configId: data.configId, keywords: data.keywords },
      }),
    onSuccess: () => {
      toast.success("Keywords added successfully!");
      void queryClient.invalidateQueries({
        queryKey: ["geoGridResults", activeConfigId],
      });
      setNewKeywordInput("");
    },
  });

  const removeKeywordMutation = useMutation({
    mutationFn: (data: { configId: string; keywordIds: string[] }) =>
      removeGeoGridKeywords({
        data: {
          projectId,
          configId: data.configId,
          keywordIds: data.keywordIds,
        },
      }),
    onSuccess: () => {
      toast.success("Keyword removed");
      void queryClient.invalidateQueries({
        queryKey: ["geoGridResults", activeConfigId],
      });
      if (selectedKeywordId) setSelectedKeywordId(null);
    },
  });

  const triggerCheckMutation = useMutation({
    mutationFn: (data: { configId: string }) =>
      triggerGeoGridCheck({ data: { projectId, configId: data.configId } }),
    onSuccess: () => {
      toast.success("Geo Grid check triggered! Refreshing results shortly.");
      void queryClient.invalidateQueries({
        queryKey: ["geoGridResults", activeConfigId],
      });
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to trigger check",
      );
    },
  });

  // Auto fill mock coordinates (e.g. San Francisco or New York)
  const handleAutoFillCoordinates = (city: "sf" | "ny" | "london") => {
    if (city === "sf") {
      setLatitude(37.7749);
      setLongitude(-122.4194);
      setBusinessName("Golden Gate Pizza");
    } else if (city === "ny") {
      setLatitude(40.7128);
      setLongitude(-74.006);
      setBusinessName("Empire State Bakery");
    } else {
      setLatitude(51.5074);
      setLongitude(-0.1278);
      setBusinessName("Big Ben Cafe");
    }
  };

  const handleCreateConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createConfigMutation.mutate({
      projectId,
      businessName,
      latitude,
      longitude,
      gridSize,
      gridSpacing,
    });
  };

  const handleAddKeywordsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordInput.trim()) return;
    const split = newKeywordInput
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    if (split.length === 0) return;

    addKeywordsMutation.mutate({
      configId: activeConfigId!,
      keywords: split,
    });
  };

  // Derive active keyword and grid results
  const currentKeywordId =
    selectedKeywordId || results?.keywords?.[0]?.id || null;
  const currentKeyword = results?.keywords?.find(
    (k) => k.id === currentKeywordId,
  );

  const gridSnapshots = useMemo((): GeoGridSnapshot[] => {
    if (!results?.snapshots || !currentKeyword) return [];
    return (results.snapshots as GeoGridSnapshot[]).filter(
      (s) => s.keywordId === currentKeywordId,
    );
  }, [results, currentKeywordId, currentKeyword]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    if (gridSnapshots.length === 0) return { arp: "-", solv: "-" };
    let totalRank = 0;
    let rankPointsCount = 0;
    let top3Count = 0;

    gridSnapshots.forEach((s) => {
      if (s.position !== null) {
        totalRank += s.position;
        rankPointsCount++;
        if (s.position <= 3) {
          top3Count++;
        }
      }
    });

    const arp =
      rankPointsCount > 0 ? (totalRank / rankPointsCount).toFixed(1) : "-";
    const solv = ((top3Count / gridSnapshots.length) * 100).toFixed(0) + "%";

    return { arp, solv };
  }, [gridSnapshots]);

  if (isConfigsLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  // Setup form if no tracking exists
  if (!configs || configs.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Map className="size-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Setup Geo Grid Maps Rank Tracking
            </h1>
            <p className="text-base-content/70">
              Track how your local business ranks on Google Maps across a
              geographical grid coordinates.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 card bg-base-100 shadow-xl border border-base-200">
            <form
              onSubmit={handleCreateConfigSubmit}
              className="card-body gap-5"
            >
              <h2 className="card-title text-xl font-bold">
                Configure Business Location
              </h2>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-semibold">
                    Tracked Business Name
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Joe's Pizza Shop"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="input input-bordered w-full"
                  required
                />
                <span className="label-text-alt mt-1.5 text-base-content/50">
                  Must exactly match the Google Business Profile title or main
                  search result title.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">
                      Center Latitude
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={(e) => setLatitude(parseFloat(e.target.value))}
                    className="input input-bordered w-full"
                    required
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">
                      Center Longitude
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={longitude}
                    onChange={(e) => setLongitude(parseFloat(e.target.value))}
                    className="input input-bordered w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">Grid Size</span>
                  </label>
                  <select
                    value={gridSize}
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="select select-bordered w-full"
                  >
                    <option value={3}>3 x 3 (9 coordinates)</option>
                    <option value={5}>5 x 5 (25 coordinates)</option>
                    <option value={7}>7 x 7 (49 coordinates)</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">
                      Grid Spacing
                    </span>
                  </label>
                  <select
                    value={gridSpacing}
                    onChange={(e) => setGridSpacing(parseFloat(e.target.value))}
                    className="select select-bordered w-full"
                  >
                    <option value={0.25}>0.25 Miles</option>
                    <option value={0.5}>0.5 Miles</option>
                    <option value={1.0}>1.0 Mile</option>
                    <option value={2.0}>2.0 Miles</option>
                    <option value={5.0}>5.0 Miles</option>
                  </select>
                </div>
              </div>

              <div className="card-actions justify-end mt-4">
                <button
                  type="submit"
                  disabled={createConfigMutation.isPending}
                  className="btn btn-primary px-8"
                >
                  {createConfigMutation.isPending && (
                    <span className="loading loading-spinner loading-xs" />
                  )}
                  Initialize Geo Grid
                </button>
              </div>
            </form>
          </div>

          <div className="card bg-base-100 border border-base-200 shadow-sm h-fit">
            <div className="card-body gap-4">
              <h3 className="font-bold text-lg">Quick Start presets</h3>
              <p className="text-sm text-base-content/60">
                Instantly populate coordinates and business names for testing
                maps rank checks locally:
              </p>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => handleAutoFillCoordinates("sf")}
                  className="btn btn-outline btn-sm justify-start gap-2"
                >
                  <Compass className="size-4" /> San Francisco (Pizza)
                </button>
                <button
                  onClick={() => handleAutoFillCoordinates("ny")}
                  className="btn btn-outline btn-sm justify-start gap-2"
                >
                  <Compass className="size-4" /> New York (Bakery)
                </button>
                <button
                  onClick={() => handleAutoFillCoordinates("london")}
                  className="btn btn-outline btn-sm justify-start gap-2"
                >
                  <Compass className="size-4" /> London (Cafe)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeConfig =
    configs.find((c) => c.id === activeConfigId) || configs[0];

  // Render visual grid representation
  const renderGridCells = () => {
    if (gridSnapshots.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 bg-base-100 rounded-2xl border border-dashed border-base-300">
          <Target className="size-12 text-base-content/30" />
          <div>
            <h4 className="font-bold">No Run Data Available</h4>
            <p className="text-sm text-base-content/65 max-w-sm">
              Trigger a check run or add keywords to compile maps rank grid
              tracking data.
            </p>
          </div>
        </div>
      );
    }

    const size = activeConfig.gridSize;
    const half = Math.floor(size / 2);

    // Arrange grid point mappings
    const rows: Array<
      Array<{ x: number; y: number; item: GeoGridSnapshot | undefined }>
    > = [];
    for (let y = half; y >= -half; y--) {
      const cols: Array<{
        x: number;
        y: number;
        item: GeoGridSnapshot | undefined;
      }> = [];
      for (let x = -half; x <= half; x++) {
        const item = gridSnapshots.find((s) => s.gridX === x && s.gridY === y);
        cols.push({ x, y, item });
      }
      rows.push(cols);
    }

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-base-100 rounded-2xl border border-base-200 shadow-inner">
        <div className="flex flex-col gap-4">
          {rows.map((rowArr, rowIndex: number) => (
            <div key={rowIndex} className="flex gap-4">
              {rowArr.map(
                ({
                  x,
                  y,
                  item,
                }: {
                  x: number;
                  y: number;
                  item: GeoGridSnapshot | undefined;
                }) => {
                  const isCenter = x === 0 && y === 0;
                  let colorClass =
                    "bg-base-200 text-base-content/40 border-base-300";
                  let rankLabel = "X";

                  if (item) {
                    if (item.position === null) {
                      colorClass =
                        "bg-neutral text-neutral-content border-neutral-focus";
                    } else if (item.position <= 3) {
                      colorClass =
                        "bg-emerald-500 text-emerald-950 border-emerald-600 shadow-md shadow-emerald-500/20";
                      rankLabel = String(item.position);
                    } else if (item.position <= 10) {
                      colorClass =
                        "bg-amber-500 text-amber-950 border-amber-600 shadow-md shadow-amber-500/20";
                      rankLabel = String(item.position);
                    } else {
                      colorClass =
                        "bg-rose-500 text-rose-950 border-rose-600 shadow-md shadow-rose-500/20";
                      rankLabel = String(item.position);
                    }
                  }

                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`tooltip tooltip-bottom`}
                      data-tip={`Coordinate: (${item?.latitude.toFixed(4)}, ${item?.longitude.toFixed(4)}) - Rank: ${item?.position ?? "Not Ranking"}`}
                    >
                      <div
                        className={`size-12 md:size-16 rounded-full border-2 flex items-center justify-center transition-all hover:scale-115 cursor-pointer font-extrabold text-lg ${colorClass} ${
                          isCenter ? "ring-4 ring-primary/45 ring-offset-2" : ""
                        }`}
                      >
                        {rankLabel}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-6 mt-8 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-emerald-500 border border-emerald-600" />
            <span>Top 3</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-amber-500 border border-amber-600" />
            <span>4 - 10</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-rose-500 border border-rose-600" />
            <span>11 - 20</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-neutral border border-neutral-focus" />
            <span>21+ / Not Found</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <Map className="size-8 text-primary" /> Geo Grid Maps Rank Tracker
          </h1>
          <p className="text-sm text-base-content/70">
            Track Maps pack visibility for{" "}
            <strong className="text-base-content">
              {activeConfig.businessName}
            </strong>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeConfigId || ""}
            onChange={(e) => setSelectedConfigId(e.target.value)}
            className="select select-bordered select-sm w-full md:w-auto"
          >
            {configs.map((c: GeoGridConfig) => (
              <option key={c.id} value={c.id}>
                {c.businessName} ({c.gridSize}x{c.gridSize})
              </option>
            ))}
          </select>

          <button
            onClick={() =>
              triggerCheckMutation.mutate({ configId: activeConfig.id })
            }
            disabled={
              triggerCheckMutation.isPending ||
              results?.latestRun?.status === "running"
            }
            className="btn btn-primary btn-sm gap-2"
          >
            {triggerCheckMutation.isPending ||
            results?.latestRun?.status === "running" ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Play className="size-4" />
            )}
            Run Rank Check
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-base-100 border border-base-200 p-5 rounded-2xl">
          <span className="text-sm text-base-content/60 font-medium">
            Average Map Rank (ARP)
          </span>
          <span className="text-3xl font-extrabold text-primary mt-1">
            {metrics.arp}
          </span>
        </div>
        <div className="card bg-base-100 border border-base-200 p-5 rounded-2xl">
          <span className="text-sm text-base-content/60 font-medium">
            Share of Local Voice (SoLV)
          </span>
          <span className="text-3xl font-extrabold text-secondary mt-1">
            {metrics.solv}
          </span>
        </div>
        <div className="card bg-base-100 border border-base-200 p-5 rounded-2xl">
          <span className="text-sm text-base-content/60 font-medium">
            Grid Center
          </span>
          <span className="text-sm font-semibold truncate mt-2">
            {activeConfig.latitude.toFixed(4)},{" "}
            {activeConfig.longitude.toFixed(4)}
          </span>
        </div>
        <div className="card bg-base-100 border border-base-200 p-5 rounded-2xl">
          <span className="text-sm text-base-content/60 font-medium">
            Last Checked
          </span>
          <span className="text-sm font-semibold mt-2">
            {activeConfig.lastCheckedAt
              ? new Date(activeConfig.lastCheckedAt).toLocaleDateString()
              : "Never"}
          </span>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Hand Details Column */}
        <div className="lg:col-span-1 space-y-6">
          {/* Keyword Selection list */}
          <div className="card bg-base-100 border border-base-200 rounded-2xl shadow-sm">
            <div className="card-body p-5 gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Keywords</h3>
                <span className="badge badge-neutral badge-sm font-bold">
                  {results?.keywords?.length ?? 0}
                </span>
              </div>

              {/* Add Keywords Form */}
              <form onSubmit={handleAddKeywordsSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add keyword..."
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  className="input input-bordered input-sm flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={addKeywordsMutation.isPending}
                  className="btn btn-primary btn-sm"
                >
                  <Plus className="size-4" />
                </button>
              </form>

              {/* Keywords list */}
              <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
                {results?.keywords?.map((k: GeoGridKeyword) => {
                  const isActive = k.id === currentKeywordId;
                  return (
                    <div
                      key={k.id}
                      onClick={() => setSelectedKeywordId(k.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isActive
                          ? "bg-primary text-primary-content font-semibold"
                          : "hover:bg-base-200"
                      }`}
                    >
                      <span className="truncate flex-1 pr-2 text-sm">
                        {k.keyword}
                      </span>
                      <button
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          removeKeywordMutation.mutate({
                            configId: activeConfig.id,
                            keywordIds: [k.id],
                          });
                        }}
                        className={`btn btn-ghost btn-xs btn-circle ${
                          isActive
                            ? "text-primary-content hover:bg-primary-focus"
                            : "text-error"
                        }`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}

                {(!results?.keywords || results.keywords.length === 0) && (
                  <p className="text-sm text-base-content/50 py-6 text-center">
                    No keywords added yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Settings */}
          <div className="card bg-base-100 border border-base-200 rounded-2xl shadow-sm text-sm">
            <div className="card-body p-5 gap-3">
              <h3 className="font-bold text-lg mb-1">Tracker Settings</h3>
              <div className="flex justify-between border-b border-base-200 pb-2">
                <span className="text-base-content/60">Business Name</span>
                <span className="font-medium">{activeConfig.businessName}</span>
              </div>
              <div className="flex justify-between border-b border-base-200 pb-2">
                <span className="text-base-content/60">Grid Spacing</span>
                <span className="font-medium">
                  {activeConfig.gridSpacing} Miles
                </span>
              </div>
              <div className="flex justify-between border-b border-base-200 pb-2">
                <span className="text-base-content/60">Grid Dimensions</span>
                <span className="font-medium">
                  {activeConfig.gridSize} x {activeConfig.gridSize}
                </span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-base-content/60">Check Schedule</span>
                <span className="font-medium capitalize">
                  {activeConfig.scheduleInterval}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand Map Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-base-100 border border-base-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="card-body p-5 gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">
                    Grid Rankings:{" "}
                    {currentKeyword
                      ? currentKeyword.keyword
                      : "Select a keyword"}
                  </h3>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Grid cells show the local pack/maps ranking. Center
                    represents business coordinates.
                  </p>
                </div>
              </div>

              {renderGridCells()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

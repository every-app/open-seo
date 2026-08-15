import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, X } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { domainField, normalizeDomain } from "@/types/schemas/domain";
import {
  depthToPages,
  pagesToDepth,
  estimateRankCheckCredits,
} from "@/shared/rank-tracking";
import { getLanguageCode } from "@/client/features/keywords/locations";
import {
  SERP_LANGUAGE_OPTIONS,
  getIsoCountryCode,
} from "@/shared/keyword-locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import type { ProjectMarket } from "@/client/features/projects/types";
import { useProjectMarket } from "@/client/features/projects/useProjectMarket";
import { SearchTargetingField } from "./SearchTargetingField";
import { KeywordSuggestionStep } from "./KeywordSuggestionStep";
import { useSaveConfigMutations } from "./useSaveConfigMutations";

type Props = {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  onClose: () => void;
  onSaved: (createdConfigId?: string) => void;
  onConfigCreated?: () => void;
};

export function RankTrackingConfigModal({
  projectId,
  existingConfig,
  onClose,
  onSaved,
  onConfigCreated,
}: Props) {
  const projectMarket = useProjectMarket(projectId);

  if (!existingConfig && !projectMarket) {
    return (
      <Modal
        maxWidth="max-w-lg"
        onClose={onClose}
        labelledBy="rank-config-modal-title"
      >
        <h2 id="rank-config-modal-title" className="sr-only">
          添加域名
        </h2>
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-base-content/50" />
        </div>
      </Modal>
    );
  }

  return (
    <RankTrackingConfigModalContent
      projectId={projectId}
      existingConfig={existingConfig}
      initialMarket={existingConfig ?? projectMarket!}
      onClose={onClose}
      onSaved={onSaved}
      onConfigCreated={onConfigCreated}
    />
  );
}

function RankTrackingConfigModalContent({
  projectId,
  existingConfig,
  initialMarket,
  onClose,
  onSaved,
  onConfigCreated,
}: Props & { initialMarket: ProjectMarket }) {
  const isEdit = !!existingConfig;
  const [step, setStep] = useState<"config" | "keywords">("config");
  const [domain, setDomain] = useState(existingConfig?.domain ?? "");
  const [devices, setDevices] = useState<"both" | "desktop" | "mobile">(
    existingConfig?.devices ?? "mobile",
  );
  const [locationCode, setLocationCode] = useState(
    existingConfig?.locationCode ?? initialMarket.locationCode,
  );
  const [languageCode, setLanguageCode] = useState(
    existingConfig?.languageCode ?? initialMarket.languageCode,
  );
  const [serpDepth, setSerpDepth] = useState(existingConfig?.serpDepth ?? 40);
  const [schedule, setSchedule] = useState<
    RankTrackingConfig["scheduleInterval"]
  >(existingConfig?.scheduleInterval ?? "weekly");
  const [targetingMode, setTargetingMode] = useState<"national" | "local">(
    existingConfig?.locationName ? "local" : "national",
  );
  const [locationName, setLocationName] = useState<string | undefined>(
    existingConfig?.locationName ?? undefined,
  );
  const [createdConfigId, setCreatedConfigId] = useState<string | null>(null);

  const selectedCountryCode = useMemo(
    () => getIsoCountryCode(locationCode),
    [locationCode],
  );

  const { createMutation, updateMutation } = useSaveConfigMutations({
    projectId,
    existingConfig,
    fields: {
      devices,
      serpDepth,
      locationCode,
      languageCode,
      targetingMode,
      locationName,
      schedule,
    },
    onCreated: (configId) => {
      setCreatedConfigId(configId);
      onConfigCreated?.();
      setStep("keywords");
    },
    onUpdated: () => onSaved(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!domain.trim()) {
      toast.error("请输入域名");
      return;
    }
    if (targetingMode === "local" && !locationName) {
      toast.error("请选择用于本地追踪的城市或地区");
      return;
    }
    const parsedDomain = domainField.safeParse(domain);
    if (!parsedDomain.success) {
      toast.error("请输入有效域名");
      return;
    }
    setDomain(parsedDomain.data);
    if (isEdit) {
      updateMutation.mutate(parsedDomain.data);
    } else {
      createMutation.mutate(parsedDomain.data);
    }
  };

  const handleDomainBlur = () => {
    try {
      setDomain(normalizeDomain(domain));
    } catch {
      // Keep invalid partial input editable; submit validation will show the error.
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (step === "keywords" && createdConfigId) {
    const closeKeywordStep = () => onSaved(createdConfigId);

    return (
      <Modal
        maxWidth="max-w-3xl"
        onClose={closeKeywordStep}
        labelledBy="keyword-suggestions-title"
      >
        <KeywordSuggestionStep
          configId={createdConfigId}
          projectId={projectId}
          domain={domain}
          locationCode={locationCode}
          onDone={(id) => onSaved(id)}
          onClose={closeKeywordStep}
        />
      </Modal>
    );
  }

  return (
    <Modal
      maxWidth="max-w-lg"
      onClose={onClose}
      labelledBy="rank-config-modal-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="rank-config-modal-title" className="text-lg font-semibold">
          {isEdit ? "编辑域名配置" : "添加域名"}
        </h2>
        <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">目标域名</span>
          </label>
          <input
            type="text"
            placeholder="example.com"
            className="input input-bordered w-full"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={handleDomainBlur}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">国家或地区</span>
          </label>
          <LocationSelect
            value={locationCode}
            onChange={(newLocationCode) => {
              setLocationCode(newLocationCode);
              setLanguageCode(getLanguageCode(newLocationCode));
              // A picked city belongs to the previous country.
              setLocationName(undefined);
            }}
          />
        </div>

        <SearchTargetingField
          mode={targetingMode}
          onModeChange={setTargetingMode}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          countryCode={selectedCountryCode}
        />

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">语言</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
          >
            {SERP_LANGUAGE_OPTIONS.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            默认使用所选国家或地区的语言。任何地区都可追踪任意语言，请选择客户实际使用的搜索语言。
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">设备</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={devices}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "both" ||
                value === "desktop" ||
                value === "mobile"
              ) {
                setDevices(value);
              }
            }}
          >
            <option value="both">桌面端和移动端</option>
            <option value="desktop">仅桌面端</option>
            <option value="mobile">仅移动端</option>
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            多数 Google 搜索来自移动端，请根据您的客户情况选择。
          </div>
          {devices === "both" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-info">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>同时追踪两种设备时，每次关键词检查会消耗 2 倍点数</span>
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">检查频率</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={schedule}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "daily" ||
                value === "weekly" ||
                value === "monthly" ||
                value === "manual"
              ) {
                setSchedule(value);
              }
            }}
          >
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月（月末）</option>
            <option value="manual">仅手动</option>
          </select>
          {schedule === "daily" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>每日检查消耗的点数约为每周检查的 7 倍</span>
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">搜索深度</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={depthToPages(serpDepth)}
            onChange={(e) => setSerpDepth(pagesToDepth(Number(e.target.value)))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((pages) => (
              <option key={pages} value={pages}>
                {pages} 页（前 {pages * 10} 条结果）
              </option>
            ))}
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            检查 10 页的成本约为 1 页的 8 倍
          </div>
        </div>

        {(() => {
          // Scheduled checks run through the cheaper task queue; manual
          // configs only ever pay the live price.
          const { costUsd: costPerKeyword } = estimateRankCheckCredits(
            1,
            devices,
            serpDepth,
            schedule === "manual" ? "live" : "queued",
          );
          const checksPerMonth =
            schedule === "daily" ? 30 : schedule === "weekly" ? 4 : 1;
          return (
            <div className="rounded-lg bg-base-200/50 px-3 py-2.5 text-xs text-base-content/70 space-y-0.5">
              <div>
                <span className="font-mono font-semibold text-base-content">
                  ~${costPerKeyword.toFixed(4)}
                </span>{" "}
                每个关键词每次检查
              </div>
              {schedule !== "manual" && (
                <div>
                  50 个关键词预计消耗{" "}
                  <span className="font-mono font-semibold text-base-content">
                    ~${(costPerKeyword * 50 * checksPerMonth).toFixed(2)}
                  </span>
                  /month
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isPending || !domain.trim()}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "保存更改" : "添加域名"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

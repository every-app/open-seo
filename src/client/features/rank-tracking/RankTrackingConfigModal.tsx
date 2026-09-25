import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, X } from "@/client/components/icons";
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

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Field, FieldDescription } from "@/client/components/ui/field";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";

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
          Add Domain
        </h2>
        <div className="flex min-h-40 items-center justify-center">
          <Spinner />
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
      toast.error("Please enter a domain");
      return;
    }
    if (targetingMode === "local" && !locationName) {
      toast.error("Please select a city or region for local targeting");
      return;
    }
    const parsedDomain = domainField.safeParse(domain);
    if (!parsedDomain.success) {
      toast.error("Please enter a valid domain");
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
          {isEdit ? "Edit Domain Config" : "Add Domain"}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field>
          <Label>Target Domain</Label>
          <Input
            type="text"
            placeholder="example.com"
            className="w-full"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={handleDomainBlur}
          />
        </Field>

        <Field>
          <Label>Country</Label>
          <LocationSelect
            value={locationCode}
            onChange={(newLocationCode) => {
              setLocationCode(newLocationCode);
              setLanguageCode(getLanguageCode(newLocationCode));
              // A picked city belongs to the previous country.
              setLocationName(undefined);
            }}
          />
        </Field>

        <SearchTargetingField
          mode={targetingMode}
          onModeChange={setTargetingMode}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          countryCode={selectedCountryCode}
        />

        <Field>
          <Label>Language</Label>
          <NativeSelect
            className="w-full"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
          >
            {SERP_LANGUAGE_OPTIONS.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription className="text-xs">
            Defaults to the country's language. Any language can be tracked in
            any country — pick the one your customers search in.
          </FieldDescription>
        </Field>

        <Field>
          <Label>Devices</Label>
          <NativeSelect
            className="w-full"
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
            <option value="both">Desktop + Mobile</option>
            <option value="desktop">Desktop only</option>
            <option value="mobile">Mobile only</option>
          </NativeSelect>
          <FieldDescription className="text-xs">
            Most Google searches come from mobile, but select this based on your
            customer.
          </FieldDescription>
          {devices === "both" && (
            <div className="flex items-start gap-1.5 text-xs text-info">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Tracking both devices uses 2x credits per keyword check
              </span>
            </div>
          )}
        </Field>

        <Field>
          <Label>Schedule</Label>
          <NativeSelect
            className="w-full"
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
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly (end of month)</option>
            <option value="manual">Manual only</option>
          </NativeSelect>
          {schedule === "daily" && (
            <div className="flex items-start gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>Daily checks use 7x more credits than weekly</span>
            </div>
          )}
        </Field>

        <Field>
          <Label>Search Depth</Label>
          <NativeSelect
            className="w-full"
            value={depthToPages(serpDepth)}
            onChange={(e) => setSerpDepth(pagesToDepth(Number(e.target.value)))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((pages) => (
              <option key={pages} value={pages}>
                {pages} {pages === 1 ? "page" : "pages"} (top {pages * 10}{" "}
                results)
              </option>
            ))}
          </NativeSelect>
          <FieldDescription className="text-xs">
            10 pages is ~8x more expensive than 1 page
          </FieldDescription>
        </Field>

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
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground space-y-0.5">
              <div>
                <span className="font-mono font-semibold text-foreground">
                  ~${costPerKeyword.toFixed(4)}
                </span>{" "}
                per keyword per check
              </div>
              {schedule !== "manual" && (
                <div>
                  50 keywords would cost{" "}
                  <span className="font-mono font-semibold text-foreground">
                    ~${(costPerKeyword * 50 * checksPerMonth).toFixed(2)}
                  </span>
                  /month
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            disabled={isPending || !domain.trim()}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Domain"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

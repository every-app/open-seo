import { autumnSeoDataCreditsToUsd } from "@/shared/billing";

export function getIncludedFeatureQuantity(
  plan: { items: Array<{ featureId: string; included: number }> } | null,
  featureId: string,
) {
  return (
    plan?.items.find((item) => item.featureId === featureId)?.included ?? 0
  );
}

export function parseTopUpAmount(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      parsed: 20,
    };
  }

  const parsed = Number(trimmed);
  const isValid = Number.isInteger(parsed) && parsed >= 10 && parsed <= 99;

  return {
    isValid,
    parsed: isValid ? parsed : 20,
  };
}

export function formatCreditAmount(value: number) {
  return formatUsd(autumnSeoDataCreditsToUsd(value));
}

export function formatPlanPrice(
  amount?: number | null,
  interval?: string | null,
) {
  if (typeof amount !== "number" || !interval) {
    return "$5/month";
  }

  return `${formatUsd(amount, amount % 1 === 0 ? 0 : 2)}/${intervalToLabel(interval)}`;
}

function formatUsd(value: number, minimumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits: 2,
  }).format(value);
}

function intervalToLabel(interval: string) {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    case "quarter":
      return "quarter";
    case "semi_annual":
      return "6 months";
    case "week":
      return "week";
    case "day":
      return "day";
    case "one_off":
      return "one-time";
    default:
      return interval;
  }
}

import { createPortal } from "react-dom";
import type { KeywordIntent } from "@/types/keywords";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

const COLORS: Record<KeywordIntent, string> = {
  informational: "border-info/30 bg-info/15 text-info",
  commercial: "border-warning/35 bg-warning/20 text-warning",
  transactional: "border-success/30 bg-success/15 text-success",
  navigational: "border-primary/30 bg-primary/15 text-primary",
  unknown: "border-base-300 bg-base-200 text-base-content/60",
};

const SHORT_LABELS: Record<KeywordIntent, string> = {
  informational: "信息",
  commercial: "商业",
  transactional: "交易",
  navigational: "导航",
  unknown: "?",
};

/** Full intent labels, shared with the keyword filters so both stay in sync. */
export const INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: "信息型",
  commercial: "商业调研型",
  transactional: "交易型",
  navigational: "导航型",
  unknown: "未知",
};

const DESCRIPTIONS: Record<
  KeywordIntent,
  { label: string; description: string }
> = {
  informational: {
    label: INTENT_LABELS.informational,
    description: "搜索者希望获取信息或答案，适合教育内容、指南和简明对比说明。",
  },
  commercial: {
    label: INTENT_LABELS.commercial,
    description: "搜索者正在购买前比较方案，适合对比、替代方案和产品导向页面。",
  },
  transactional: {
    label: INTENT_LABELS.transactional,
    description:
      "搜索者准备完成购买等操作，应优先提供清晰的优惠、价格、试用或转化路径。",
  },
  navigational: {
    label: INTENT_LABELS.navigational,
    description: "搜索者正在寻找特定网站、品牌或页面，内容应准确匹配预期入口。",
  },
  unknown: {
    label: INTENT_LABELS.unknown,
    description: "此关键词暂无搜索意图数据，请结合其他信息制定内容策略。",
  },
};

export function IntentBadge({ intent }: { intent: KeywordIntent }) {
  const tooltip = useFloatingTooltip<HTMLSpanElement>({ delayMs: 0 });
  const details = DESCRIPTIONS[intent];

  return (
    <span
      ref={tooltip.triggerRef}
      className={`inline-flex h-6 min-w-11 cursor-help items-center justify-center rounded-full border px-2 text-xs font-semibold leading-none ${COLORS[intent]}`}
      tabIndex={0}
      aria-label={`${details.label} search intent`}
      aria-describedby={tooltip.isOpen ? tooltip.tooltipId : undefined}
      onMouseEnter={tooltip.open}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.open}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
    >
      {SHORT_LABELS[intent]}
      {tooltip.isOpen && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              <span className="block font-semibold">{details.label}</span>
              <span className="mt-1 block">{details.description}</span>
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </span>
  );
}

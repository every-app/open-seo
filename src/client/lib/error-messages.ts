import { FREE_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "请登录后重试。",
  AUTH_CONFIG_MISSING:
    "OpenSEO 身份验证尚未配置，请按照 README 中的步骤配置 Cloudflare Access。",
  PAYMENT_REQUIRED: "使用 OpenSEO 需要有效的托管订阅。",
  INSUFFICIENT_CREDITS: "点数已用完，请补充点数或升级套餐后继续。",
  FORBIDDEN: "你无权访问此资源。",
  NOT_FOUND: "找不到请求的资源。",
  AUDIT_CAPACITY_REACHED:
    "当前账户已达到审计容量上限，请删除项目中的旧审计后再创建新审计。",
  AUDIT_PAGE_LIMIT_EXCEEDED: `免费套餐每次最多审计 ${FREE_MAX_AUDIT_PAGES} 个页面。升级后可运行更大规模的审计。`,
  AUDIT_ALREADY_RUNNING:
    "已有一项审计正在运行，请等待其完成或删除后再开始新审计。",
  VALIDATION_ERROR: "请检查输入内容后重试。",
  CRAWL_TARGET_BLOCKED: "安全策略已阻止此抓取目标。",
  BACKLINKS_BILLING_ISSUE: "已连接的 DataForSEO 账户存在账单或余额问题。",
  AI_SEARCH_BILLING_ISSUE: "已连接的 DataForSEO 账户存在账单或余额问题。",
  DATAFORSEO_AUTH_FAILED:
    "DataForSEO 拒绝了此 API 密钥。请确认 DATAFORSEO_API_KEY 是 DataForSEO 登录名和密码（login:password）的 Base64 编码。",
  RATE_LIMITED: "请求过于频繁，请稍后重试。",
  UPSTREAM_UNAVAILABLE: "数据提供商暂时不可用，请稍后重试。",
  CONFLICT: "此请求与现有数据冲突。",
  INTERNAL_ERROR: "发生意外错误，请检查服务器日志后重试。",
};

// Setup errors cross the wire as "CODE: detail" (see toClientError) so the
// user sees the server's specific guidance while code-driven UI (error cards,
// redirects) still keys off the code.
function splitCodedMessage(
  message: string,
): { code: ErrorCode; detail: string } | null {
  const separatorIndex = message.indexOf(": ");
  if (separatorIndex === -1) return null;
  const code = message.slice(0, separatorIndex);
  if (!isErrorCode(code)) return null;
  return { code, detail: message.slice(separatorIndex + 2) };
}

export function getStandardErrorMessage(
  error: unknown,
  fallback: string = STANDARD_MESSAGES.INTERNAL_ERROR,
): string {
  if (!(error instanceof Error)) return fallback;
  if (isErrorCode(error.message)) return STANDARD_MESSAGES[error.message];
  const coded = splitCodedMessage(error.message);
  if (coded) return coded.detail;
  if (error.message) return error.message;
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  if (isErrorCode(error.message)) return error.message;
  return splitCodedMessage(error.message)?.code ?? null;
}

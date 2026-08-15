import { Link } from "@tanstack/react-router";
import { ShieldAlert, Wrench } from "lucide-react";

export function SamSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  return (
    <section>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-6 md:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-warning/15 p-2.5 text-warning shrink-0">
            <Wrench className="size-5" />
          </div>
          <div className="max-w-3xl space-y-1.5">
            <h2 className="text-xl font-semibold">启用 AI 功能</h2>
            <div className="text-sm text-base-content/68">
              OpenSEO 内置 AI 智能体 SAM 需要 OpenRouter API 密钥。请在
              OpenRouter 创建密钥，将其设置为 <code>OPENROUTER_API_KEY</code>{" "}
              环境变量，重启 OpenSEO 后在此确认。
            </div>
            <div className="text-xs text-base-content/50">
              各类部署方式的操作步骤请查看{" "}
              <Link
                className="underline underline-offset-2 hover:text-base-content/70"
                to="/help/openrouter-api-key"
              >
                OpenRouter API 密钥设置指南
              </Link>
              .
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isRefetching}
          >
            {isRefetching ? "正在确认…" : "确认 API 密钥"}
          </button>
          <a
            className="btn"
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            打开 OpenRouter 密钥页面
          </a>
        </div>

        {errorMessage ? (
          <div className="alert alert-warning">
            <ShieldAlert className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

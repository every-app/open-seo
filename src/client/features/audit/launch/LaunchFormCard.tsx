import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { MIN_PAGES } from "@/client/features/audit/launch/types";
import type { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { getFieldError, getFormError } from "@/client/lib/forms";
import { PAID_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

type Props = {
  launchForm: ReturnType<typeof useLaunchController>["launchForm"];
  commitMaxPagesInput: () => number;
  maxPagesLimit: number;
};

export function LaunchFormCard({
  commitMaxPagesInput,
  launchForm,
  maxPagesLimit,
}: Props) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <h2 className="card-title text-base">开始新审计</h2>

        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void launchForm.handleSubmit();
          }}
        >
          <launchForm.Field name="url">
            {(field) => {
              const urlError = getFieldError(field.state.meta.errors);

              return (
                <label
                  className={`input input-bordered w-full lg:col-span-9 ${urlError ? "input-error" : ""}`}
                >
                  <input
                    placeholder="https://example.com"
                    value={field.state.value}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      if (launchForm.state.errorMap.onSubmit) {
                        launchForm.setErrorMap({ onSubmit: undefined });
                      }
                    }}
                  />
                </label>
              );
            }}
          </launchForm.Field>

          <launchForm.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                className="btn btn-primary btn-sm w-full lg:col-span-3"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 启动中…
                  </>
                ) : (
                  "开始审计"
                )}
              </button>
            )}
          </launchForm.Subscribe>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-12 lg:items-start">
            <LaunchOptions
              launchForm={launchForm}
              commitMaxPagesInput={commitMaxPagesInput}
              maxPagesLimit={maxPagesLimit}
            />
            <LighthouseOptions launchForm={launchForm} />
          </div>
        </form>

        <LaunchErrors launchForm={launchForm} />
      </div>
    </div>
  );
}

function LaunchOptions({
  launchForm,
  commitMaxPagesInput,
  maxPagesLimit,
}: Props) {
  const isFreeLimited = maxPagesLimit < PAID_MAX_AUDIT_PAGES;

  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-base-content/60">
        抓取上限
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-base-content/70">最大页面数</span>
        <launchForm.Field name="maxPagesInput">
          {(field) => (
            <input
              type="number"
              min={MIN_PAGES}
              max={maxPagesLimit}
              className="input input-bordered input-sm w-28"
              value={field.state.value}
              onChange={(event) => {
                const next = event.target.value;
                if (!/^\d*$/.test(next)) return;
                field.handleChange(next);
                if (launchForm.state.errorMap.onSubmit) {
                  launchForm.setErrorMap({ onSubmit: undefined });
                }
              }}
              onBlur={commitMaxPagesInput}
            />
          )}
        </launchForm.Field>
      </div>
      <p className="text-xs text-base-content/50">
        请输入 {MIN_PAGES} 到 {maxPagesLimit.toLocaleString()} 之间的任意数值。
        {isFreeLimited ? (
          <>
            {" "}
            <Link
              to={SUBSCRIBE_ROUTE}
              search={{ upgrade: true }}
              className="link link-primary"
            >
              升级
            </Link>{" "}
            后最高可抓取 {PAID_MAX_AUDIT_PAGES.toLocaleString()} 个页面。
          </>
        ) : null}
      </p>
    </div>
  );
}

function LighthouseOptions({ launchForm }: Pick<Props, "launchForm">) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="label cursor-pointer justify-start gap-2 p-0">
        <launchForm.Field name="runLighthouse">
          {(field) => (
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={Boolean(field.state.value)}
              onChange={(event) => field.handleChange(event.target.checked)}
            />
          )}
        </launchForm.Field>
        <span
          className="text-sm font-medium text-base-content/80"
          title="Lighthouse 用于衡量页面性能并发现问题。"
        >
          包含 Lighthouse 检查
        </span>
      </label>

      <launchForm.Subscribe
        selector={(snapshot) => snapshot.values.runLighthouse}
      >
        {(runLighthouse) =>
          runLighthouse ? (
            <div className="space-y-1">
              <p className="text-xs text-base-content/60">
                系统会选取 20 个页面样本进行审计，并排除重复模板页面。
              </p>
            </div>
          ) : null
        }
      </launchForm.Subscribe>
    </div>
  );
}

function LaunchErrors({ launchForm }: Pick<Props, "launchForm">) {
  return (
    <div className="space-y-2">
      <launchForm.Field name="url">
        {(field) => {
          const urlError = getFieldError(field.state.meta.errors);

          return urlError ? (
            <p className="text-sm text-error">{urlError}</p>
          ) : null;
        }}
      </launchForm.Field>

      <launchForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
        {(submitError) => {
          const errorMessage = getFormError(submitError);

          return errorMessage ? (
            <div className="alert alert-error py-2">
              <span className="text-sm">{errorMessage}</span>
            </div>
          ) : null;
        }}
      </launchForm.Subscribe>
    </div>
  );
}

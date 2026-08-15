import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import { useSession } from "@/lib/auth-client";
import { saveOnboardingSite } from "@/serverFunctions/onboardingChat";
import { OnboardingAccountMenu } from "./OnboardingAccountMenu";
import { OnboardingChatConversation } from "./OnboardingChatConversation";
import {
  invalidateOnboardingChatState,
  onboardingChatStateQueryOptions,
} from "./onboardingChatQueries";

// Full-viewport chat surface. Breaks out of the centered, padded AuthPageShell
// with `fixed inset-0` so the chat fills the screen. There's no header bar —
// the strategy's first message carries the context — and inner content is
// constrained to a narrow column for comfortable reading width.
function StrategyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-base-100">{children}</div>
  );
}

export function OnboardingChat() {
  const stateQuery = useQuery(onboardingChatStateQueryOptions());
  const { data: session } = useSession();
  const accountMenu = <OnboardingAccountMenu email={session?.user?.email} />;

  if (stateQuery.isError) {
    return (
      <StrategyShell>
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-error">
          无法加载你的策略，请刷新页面后重试。
        </div>
      </StrategyShell>
    );
  }

  if (!stateQuery.data) {
    return (
      <StrategyShell>
        <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" />
          正在加载…
        </div>
      </StrategyShell>
    );
  }

  const { projectId, domain } = stateQuery.data;

  return (
    <StrategyShell>
      {accountMenu}
      {!domain ? (
        <SiteForm projectId={projectId} />
      ) : (
        <OnboardingChatConversation projectId={projectId} domain={domain} />
      )}
    </StrategyShell>
  );
}

function SiteForm({ projectId }: { projectId: string }) {
  const [domain, setDomain] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_LOCATION_CODE);

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingSite({ data: { projectId, domain, locationCode } }),
    onSuccess: invalidateOnboardingChatState,
  });

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <form
        className="w-full max-w-md space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (domain.trim()) {
            save.mutate();
          }
        }}
      >
        <div className="space-y-3 text-center">
          <img
            src="/transparent-logo.png"
            alt="OpenSEO"
            className="mx-auto size-10 rounded-lg"
          />
          <h1 className="text-xl font-semibold">介绍一下你的网站</h1>
          <p className="text-sm text-base-content/60">
            如果你有多个网站，可以稍后继续添加。
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
          <label className="block space-y-1">
            <span className="text-sm font-medium">你的网站</span>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="example.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">
              获取 SEO 数据时使用的国家或地区
            </span>
            <LocationSelect value={locationCode} onChange={setLocationCode} />
          </label>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={!domain.trim() || save.isPending}
          >
            {save.isPending ? "正在保存…" : "继续"}
          </button>
        </div>
      </form>
    </div>
  );
}

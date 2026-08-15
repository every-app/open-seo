import { AlertTriangle } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";

export function GoogleOAuthSetupWarning({
  integrationName,
  docsUrl,
}: {
  integrationName: string;
  docsUrl: string;
}) {
  return (
    <div className="alert alert-warning items-start text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">尚未配置 Google OAuth 客户端</p>
        <p className="text-base-content/70">
          请先为此 OpenSEO 部署添加 Google 客户端 ID 和密钥，再连接{" "}
          {integrationName}。
        </p>
        <SafeExternalLink
          url={docsUrl}
          label="打开设置指南"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        />
      </div>
    </div>
  );
}

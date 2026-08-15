import { createFileRoute } from "@tanstack/react-router";

const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/_app/help/dataforseo-api-key")({
  component: DataforseoApiKeyHelpPage,
});

function DataforseoApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">设置 DataForSEO API 密钥</h1>
            <p className="text-sm text-base-content/70">
              OpenSEO 需要 <code>DATAFORSEO_API_KEY</code>{" "}
              密钥，才能运行关键词、 域名和 SEO 数据工作流。
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">设置步骤</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                前往{" "}
                <a
                  className="link link-primary"
                  href={DATAFORSEO_API_ACCESS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  DataForSEO API 访问页面
                </a>{" "}
                ，并通过电子邮件申请 API 凭据。
              </li>
              <li>
                按以下格式对 DataForSEO 登录名和 API 密码进行 Base64 编码：
                <pre className="mt-2 p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
                  <code>printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64</code>
                </pre>
              </li>
              <li>
                将输出结果保存为环境中的 <code>DATAFORSEO_API_KEY</code> 密钥。
              </li>
            </ol>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 text-sm text-base-content/75">
            <h2 className="card-title text-base">
              Cloudflare Workers（控制台界面）
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-base-content/80">
              <li>
                在 Cloudflare 中前往 <code>Compute</code> -&gt;{" "}
                <code>Workers &amp; Pages</code>
                ，然后打开您的 OpenSEO Worker。
              </li>
              <li>
                打开 <code>设置</code>。
              </li>
              <li>
                前往 <code>Variables &amp; Secrets</code>{" "}
                并添加一个名为以下内容的新密钥：
                <code className="mx-1">DATAFORSEO_API_KEY</code>。
              </li>
              <li>粘贴上方终端命令生成的 Base64 值并保存。</li>
            </ol>

            <div className="divider my-1" />

            <p>也可以在终端中运行以下命令设置同一密钥：</p>
            <pre className="p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
              <code>npx wrangler secret put DATAFORSEO_API_KEY</code>
            </pre>
            <p>
              出现提示时，请使用以下内容的 Base64 值：{" "}
              <code>login:password</code> 。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

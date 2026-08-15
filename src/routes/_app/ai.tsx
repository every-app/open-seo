import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { getAuthMode, isHostedClientAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import { ClaudeIcon, CodexIcon } from "@/client/features/ai-mcp/AgentIcons";
import { AvailableTools } from "@/client/features/ai-mcp/AvailableTools";
import {
  CodeBlock,
  Collapsible,
  CopyButton,
} from "@/client/features/ai-mcp/SetupControls";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const SUPPORT_EMAIL = "ben@openseo.so";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";
const SKILL_NAMES = [
  "seo-project-setup",
  "seo-coach",
  "keyword-research",
  "keyword-clustering",
  "competitive-landscape",
  "competitor-analysis",
  "link-prospecting",
];
const SKILLS_INSTALL = `npx skills add every-app/open-seo`;
const ALL_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*'`;
const CLAUDE_CODE_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent claude-code`;
const CODEX_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent codex`;
const SKILLS_MANUAL_INSTALL = `git clone https://github.com/every-app/open-seo.git

# Codex
mkdir -p ~/.codex/skills
cp -R open-seo/.agents/skills/* ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R open-seo/.agents/skills/* ~/.claude/skills/`;

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

function AiPage() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-12 md:px-6 md:py-16 pb-24 md:pb-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">AI 与 MCP</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          将 AI 智能体连接到 OpenSEO，即可从编辑器或对话中执行关键词研究、SERP
          分析、域名查询和反向链接检查。
        </p>

        {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
          <div className="alert alert-warning mt-6 text-sm" role="alert">
            <ShieldAlert className="size-4 shrink-0" />
            <span>
              此实例位于 Cloudflare Access 之后。请先在 Access 应用中启用
              Managed OAuth，MCP 客户端才能连接。{" "}
              <a
                href="https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access"
                target="_blank"
                rel="noreferrer"
                className="link font-medium"
              >
                设置指南
              </a>
            </span>
          </div>
        ) : null}

        <section className="mt-8">
          <div className="rounded-lg border border-base-300 bg-base-200 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                MCP 服务器网址
              </p>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP 网址已复制"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
            <code className="mt-2 block break-all font-mono text-sm text-base-content">
              {mcpUrl}
            </code>
          </div>
          <p className="mt-2.5 text-xs text-base-content/55 leading-relaxed">
            将此网址粘贴到任意 MCP 客户端。它会指向您当前使用的 OpenSEO
            实例，包括托管、自托管或本地实例。出现提示时请登录 OpenSEO。
          </p>
          {isHostedClientAuthMode() ? (
            <p className="mt-2 text-xs text-base-content/55">
              对于无界面环境或 CI，请使用以下位置创建的 API 密钥：{" "}
              <Link className="link link-primary" to="/settings">
                设置
              </Link>{" "}
              ，以替代 OAuth 登录。
            </p>
          ) : null}
        </section>

        <section className="mt-10">
          <h2 className="text-base font-semibold">设置指南</h2>
          <p className="mt-1.5 text-sm text-base-content/70">
            选择您的智能体。
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="claude-code"
              title="Claude Code"
              subtitle="通过命令行添加"
              icon={<ClaudeIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">在终端中运行：</p>
              <CodeBlock
                code={`claude mcp add --transport http --scope user openseo ${mcpUrl}`}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "claude-code",
                  })
                }
              />
              <p className="text-sm text-base-content/70">
                出现提示时批准登录。
              </p>
            </Collapsible>

            <Collapsible
              id="claude-desktop"
              title="Claude Desktop"
              subtitle="添加自定义连接器"
              icon={<ClaudeIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  打开 <span className="text-base-content">设置</span> →{" "}
                  <span className="text-base-content">连接器</span>。
                </li>
                <li>
                  点击{" "}
                  <span className="font-medium text-base-content">
                    添加自定义连接器
                  </span>
                  。
                </li>
                <li>粘贴上方 MCP 网址，然后点击“添加”。</li>
                <li>出现提示时批准 OpenSEO 登录。</li>
                <li>
                  可选：OpenSEO 连接成功后，点击{" "}
                  <span className="font-medium text-base-content">配置</span>
                  ，然后选择{" "}
                  <span className="font-medium text-base-content">
                    始终允许
                  </span>
                  。需要 Claude 每次询问后才能使用的工具可保持原设置。
                </li>
              </ol>
              <p className="text-xs text-base-content/55 leading-relaxed">
                需要 Claude Pro、Max、Team 或 Enterprise 方案。
              </p>
            </Collapsible>

            <Collapsible
              id="codex"
              title="Codex"
              subtitle="通过命令行添加"
              icon={<CodexIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">在终端中运行：</p>
              <CodeBlock
                code={`codex mcp add openseo --url ${mcpUrl}`}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "codex",
                  })
                }
              />
              <p className="text-sm text-base-content/70">
                出现提示时批准登录。
              </p>
            </Collapsible>

            <Collapsible
              id="codex-desktop"
              title="Codex Desktop"
              subtitle="设置 → 集成与 MCP"
              icon={<CodexIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  打开{" "}
                  <span className="text-base-content">
                    设置（Settings）→ 集成与 MCP（Integrations & MCP）
                  </span>
                  。
                </li>
                <li>
                  点击{" "}
                  <span className="font-medium text-base-content">
                    添加自己的连接
                  </span>
                  .
                </li>
                <li>粘贴上方 MCP 网址。</li>
                <li>出现提示时批准 OpenSEO 登录。</li>
              </ol>
            </Collapsible>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">OpenSEO 技能</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            技能为 Codex 和 Claude Code 提供可复用的 SEO 工作流，并可在需要实时
            SERP、关键词、反向链接或域名数据时调用 OpenSEO MCP 工具。
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="skills-add"
              title="使用 skills add 安装"
              subtitle="推荐的跨智能体安装方式"
            >
              <CodeBlock code={SKILLS_INSTALL} />
              <p className="text-sm text-base-content/70">
                也可以自动接受每个 OpenSEO 技能：
              </p>
              <CodeBlock code={ALL_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="claude-code-skills"
              title="为 Claude Code 安装"
              subtitle="仅安装到 Claude Code"
              icon={<ClaudeIcon className="size-5" />}
            >
              <CodeBlock code={CLAUDE_CODE_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="codex-skills"
              title="为 Codex 安装"
              subtitle="仅安装到 OpenAI Codex"
              icon={<CodexIcon className="size-5" />}
            >
              <CodeBlock code={CODEX_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="manual-skills"
              title="从 GitHub 手动安装"
              subtitle="克隆仓库并复制技能目录"
            >
              <CodeBlock code={SKILLS_MANUAL_INSTALL} />
            </Collapsible>
          </div>
          <div className="mt-5">
            <p className="text-sm text-base-content/70 leading-relaxed">
              从这里开始{" "}
              <span className="font-mono text-base-content">
                /seo-project-setup
              </span>
              。它会询问您的项目信息，并协助配置工作区。
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-base-content/50">
              可用技能
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm text-base-content/70 sm:grid-cols-2">
              {SKILL_NAMES.map((skill) => (
                <li key={skill} className="flex gap-2">
                  <span className="text-base-content/35">-</span>
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">可用工具</h2>
          <div className="mt-5">
            <AvailableTools />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Sam：AI SEO 队友</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Sam 是面向 Claude Code
            和其他编程智能体的实验性内容工作流，整合了关键词研究、来源发现、内容起草和质量检查。
          </p>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
          >
            在 GitHub 查看 Sam
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">路线图</h2>
          <ul className="mt-4 space-y-3">
            {[
              {
                title: "应用内 SEO 研究智能体",
                description: "无需离开 OpenSEO 即可提问和开展研究",
              },
              {
                title: "内容助手",
                description: "使用已保存关键词和业务背景生成草稿",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm">
                <span className="mt-[2px] shrink-0 text-base-content/40">
                  ·
                </span>
                <span className="text-base-content/70">
                  <span className="font-medium text-base-content">
                    {item.title}
                  </span>
                  <br />
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-base-content/55 leading-relaxed">
          欢迎通过以下方式反馈：{" "}
          <a
            className="link link-primary"
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>{" "}
          或发送邮件{" "}
          <a className="link link-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          。
        </p>
      </div>
    </div>
  );
}

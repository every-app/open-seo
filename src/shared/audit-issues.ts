/**
 * Registry of site-audit issue types.
 *
 * Shared between the server (issue engine, MCP tools) and the client
 * (issues UI, CSV export). Each issue row in `audit_issues` references one
 * of these types by id.
 */

export type IssueSeverity = "critical" | "warning" | "info";

interface AuditIssueDescriptor {
  severity: IssueSeverity;
  title: string;
  explanation: string;
  howToFix: string;
}

export const AUDIT_ISSUE_TYPES = {
  "blocked-page": {
    severity: "critical",
    title: "爬虫被拦截",
    explanation:
      "网站返回了机器人验证或拒绝访问响应，例如 Cloudflare 验证、403 或 429，未返回正常页面。因此该页面无法审计，搜索引擎等其他爬虫也可能遇到类似阻碍。",
    howToFix:
      "如果您拥有此网站，请在 WAF 或机器人防护设置中将“OpenSEO-Audit”用户代理加入允许名单。使用 Cloudflare 时，可创建 WAF 自定义规则，在用户代理包含“OpenSEO-Audit”时跳过机器人防护；部分免费方案可能需要适当放宽防护。完成后重新运行审计。",
  },
  "server-error": {
    severity: "critical",
    title: "服务器错误（5xx）",
    explanation:
      "页面返回了 5xx 服务器错误。搜索引擎反复遇到服务器错误后会降低抓取频率，并可能将页面移出索引。",
    howToFix:
      "检查此网址的服务器日志并修复根本错误。如果页面已经删除，请返回 404/410，或将其重定向到相关页面。",
  },
  "broken-internal-link": {
    severity: "critical",
    title: "失效的内部链接",
    explanation:
      "此页面链接到返回错误状态（4xx/5xx）的内部网址。失效链接会浪费抓取预算、损失链接权重并影响用户体验，是常见且影响较大的技术 SEO 问题。",
    howToFix:
      "将链接更新为正确且可访问的网址，或移除链接。如果目标已迁移，建议直接链接到新网址，减少对重定向的依赖。",
  },
  "missing-title": {
    severity: "critical",
    title: "缺少标题标签",
    explanation:
      "页面缺少 <title>。标题是重要的页面相关性信号，也会作为搜索结果标题显示。缺少标题时，搜索引擎会自行生成，结果通常不够理想。",
    howToFix:
      "添加唯一且描述清晰的 <title>，长度约为 50 到 60 个字符，并包含页面核心主题。",
  },
  "broken-page": {
    severity: "warning",
    title: "页面返回错误（4xx）",
    explanation:
      "此网址在抓取时返回了客户端错误，例如 404。如果站点地图或其他页面仍引用它，爬虫会持续浪费请求。",
    howToFix:
      "如果页面应当存在，请恢复页面。如果页面已计划删除，请从站点地图和内部链接中移除，并考虑使用 301 重定向到最相关的可用页面。",
  },
  "duplicate-title": {
    severity: "warning",
    title: "标题重复",
    explanation:
      "多个页面使用相同的标题标签。搜索引擎依靠标题区分页面，重复标题会导致页面相互竞争并降低点击率。",
    howToFix:
      "为每个页面编写描述具体内容的唯一标题。模板页面应在标题模板中加入名称、分类或地区等区分属性。",
  },
  "duplicate-meta-description": {
    severity: "warning",
    title: "Meta 描述重复",
    explanation:
      "多个页面使用相同的 Meta 描述，导致搜索结果显示相同摘要，用户难以区分。",
    howToFix:
      "为每个页面编写唯一的 Meta 描述，或移除重复描述，让搜索引擎从页面内容中生成更准确的摘要。",
  },
  "duplicate-content": {
    severity: "warning",
    title: "页面内容重复",
    explanation:
      "两个或更多网址提供完全相同的可见文本。搜索引擎通常只选择一个版本建立索引，排名信号也会分散到多个重复页面。",
    howToFix:
      "合并重复页面：选择规范网址，在其他页面添加 rel=canonical，并尽可能将重复网址 301 重定向到规范网址。常见原因包括尾部斜杠、网址参数、http/https 或 www 变体。",
  },
  "missing-meta-description": {
    severity: "warning",
    title: "缺少 Meta 描述",
    explanation:
      "页面缺少 Meta 描述。搜索引擎会从正文中组合摘要，吸引力通常较弱，可能影响点击率。",
    howToFix:
      "添加约 70 到 160 个字符的 Meta 描述，概括页面内容并提供点击理由。",
  },
  "missing-h1": {
    severity: "warning",
    title: "缺少 H1 标题",
    explanation:
      "页面缺少 H1。H1 用于向用户和搜索引擎说明页面主题，缺少 H1 会降低主题清晰度。",
    howToFix: "添加一个说明页面核心主题的 H1，并与标题标签保持一致。",
  },
  "multiple-h1": {
    severity: "warning",
    title: "存在多个 H1 标题",
    explanation:
      "页面包含多个 H1，会削弱核心主题信号，也常表示模板标记存在问题，例如标志和主标题都被标记为 H1。",
    howToFix:
      "保留一个 H1 作为页面主标题，将其他标题调整为 H2/H3；标志等非标题元素应改用普通元素。",
  },
  "redirect-chain": {
    severity: "warning",
    title: "重定向链",
    explanation:
      "到达最终页面需要连续经过两次或更多重定向。每次跳转都会增加延迟、损失链接权重并消耗抓取预算，过长的链可能无法被完整跟随。",
    howToFix: "让初始网址及相关内部链接直接指向最终目标，最多保留一次重定向。",
  },
  "redirect-loop": {
    severity: "warning",
    title: "重定向循环",
    explanation:
      "此重定向最终指回自身，导致网址始终无法解析，浏览器和爬虫会因错误而停止。",
    howToFix:
      "检查此网址的重定向规则并打破循环，使重定向链最终到达返回 200 的真实页面。",
  },
  "canonical-conflict": {
    severity: "warning",
    title: "规范网址信号冲突",
    explanation:
      "页面在 HTML <link rel=canonical> 和 HTTP Link 标头中声明了不同的规范网址。信号冲突时，搜索引擎可能忽略两者并自行选择规范网址。",
    howToFix:
      "选择一个规范网址并仅在一个位置声明，通常使用 HTML head。移除另一处声明或使其保持一致。",
  },
  "thin-content": {
    severity: "warning",
    title: "内容单薄",
    explanation:
      "页面的可见文本很少。内容单薄的页面较难获得排名，也可能降低全站质量评价。对于客户端渲染网站，这还可能表示普通 HTML 爬虫无法看到内容。",
    howToFix:
      "可以补充真正有用的内容、设置 noindex，或将其合并到内容更完整的页面。如果内容由 JavaScript 渲染，请确保使用服务器渲染或预渲染。",
  },
  "images-missing-alt": {
    severity: "warning",
    title: "图片缺少替代文本",
    explanation:
      "页面中一个或多个图片缺少 alt 属性。替代文本是无障碍要求，也是搜索引擎理解图片内容的主要方式。",
    howToFix:
      '为有实际含义的图片添加描述性替代文本；仅对纯装饰图片使用空 alt（alt=""）。',
  },
  "orphan-page": {
    severity: "warning",
    title: "孤立页面",
    explanation:
      "没有已抓取页面链接到此网址，它只能通过站点地图被发现。缺少内部链接的页面获得的抓取关注和内部链接权重较少，用户也难以通过浏览找到。",
    howToFix:
      "从导航、相关内容或聚合页面等相关位置链接到此页面。如果页面无需建立索引，请将其从站点地图中移除。",
  },
  "no-outgoing-links": {
    severity: "warning",
    title: "页面没有出站链接",
    explanation:
      "页面完全没有链接，形成浏览终点。流入页面的链接权重无法继续传递，爬虫没有后续路径，用户也只能返回。",
    howToFix:
      "添加指向相关页面、上级分类或首页的链接。如果页面导航由 JavaScript 渲染，请确保服务器渲染的 HTML 中也包含导航。",
  },
  "title-too-long": {
    severity: "info",
    title: "标题过长",
    explanation:
      "标题超过约 60 个字符，搜索结果会将其截断，末尾内容可能显示不完整。",
    howToFix: "将标题缩短到约 50 到 60 个字符，并把重要词语放在前面。",
  },
  "title-too-short": {
    severity: "info",
    title: "标题过短",
    explanation: "标题少于约 10 个字符，通常难以准确描述页面或吸引点击。",
    howToFix:
      "将标题扩展为约 30 到 60 个字符的描述性短语，明确说明页面提供的内容。",
  },
  "meta-description-too-long": {
    severity: "info",
    title: "Meta 描述过长",
    explanation: "Meta 描述超过约 160 个字符，搜索引擎会截断摘要。",
    howToFix: "将描述缩短到约 70 到 160 个字符，同时保留核心信息和行动引导。",
  },
  "meta-description-too-short": {
    severity: "info",
    title: "Meta 描述过短",
    explanation:
      "Meta 描述少于约 70 个字符，没有充分利用搜索结果摘要空间，搜索引擎也可能改用页面正文。",
    howToFix: "将描述扩展到约 70 到 160 个字符，概括页面内容并提供点击理由。",
  },
  "heading-order-skip": {
    severity: "info",
    title: "标题层级跳跃",
    explanation:
      "标题层级存在跳跃，例如 H2 后直接使用 H4。这会削弱无障碍工具和内容解析所依赖的文档结构。",
    howToFix: "调整标题层级，使其按 H1 → H2 → H3 逐级下降，避免跳级。",
  },
  "slow-response": {
    severity: "info",
    title: "服务器响应缓慢",
    explanation:
      "HTML 响应耗时超过 1.5 秒。首字节时间过长会拖累后续性能指标，并降低大型网站的抓取频率。",
    howToFix:
      "检查此路由的服务器或数据库耗时与缓存设置。提供缓存或静态生成的 HTML 通常可以改善问题。",
  },
  "noindex-page": {
    severity: "info",
    title: "页面设置了 noindex",
    explanation:
      "页面通过 robots Meta 标签或 X-Robots-Tag 标头要求搜索引擎不要建立索引。这通常是有意设置，此项用于提醒。",
    howToFix:
      "如果此页面需要参与排名，请移除 noindex 指令。如果用于管理后台、感谢页或筛选页等预期场景，则无需处理。",
  },
  "canonicalized-page": {
    severity: "info",
    title: "规范网址指向其他页面",
    explanation:
      "页面将其他网址声明为规范网址，提示搜索引擎改为索引该网址。参数页面或内容分发等场景可能符合预期；如果当前页面需要参与排名，则需要检查。",
    howToFix:
      "如果此页面需要独立参与排名，请将规范网址设置为自身；其他情况无需处理。",
  },
  "deep-page": {
    severity: "info",
    title: "页面层级过深",
    explanation:
      "从首页到此页面需要点击 5 次以上。层级较深的页面抓取频率更低，获得的链接权重也更少。",
    howToFix:
      "从聚合页、分类页或导航等更高层级页面添加链接，缩短到达此页面的路径。",
  },
} as const satisfies Record<string, AuditIssueDescriptor>;

export type AuditIssueType = keyof typeof AUDIT_ISSUE_TYPES;

export const ISSUE_SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const issueRegistry: Record<string, AuditIssueDescriptor> = AUDIT_ISSUE_TYPES;

export function getIssueDescriptor(
  issueType: string,
): AuditIssueDescriptor | null {
  return issueRegistry[issueType] ?? null;
}

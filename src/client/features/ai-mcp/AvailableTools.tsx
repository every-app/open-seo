import { GA4_OAUTH_APP_PENDING } from "@/shared/ga4";

type McpTool = {
  name: string;
  title: string;
  description: string;
};

type ToolCategory = {
  label: string;
  tools: McpTool[];
};

const toolCategories: ToolCategory[] = [
  {
    label: "关键词",
    tools: [
      {
        name: "research_keywords",
        title: "研究关键词",
        description: "获取关键词创意及搜索量、难度和 CPC。",
      },
      {
        name: "get_rank_tracker",
        title: "获取排名追踪数据",
        description: "读取已追踪关键词的排名。",
      },
      {
        name: "create_rank_tracker",
        title: "创建排名追踪器",
        description: "为域名配置排名追踪。",
      },
      {
        name: "add_rank_tracking_keywords",
        title: "添加追踪关键词",
        description: "向现有排名追踪器添加关键词。",
      },
      {
        name: "remove_rank_tracking_keywords",
        title: "移除追踪关键词",
        description: "停止追踪所选关键词 ID。",
      },
      {
        name: "estimate_rank_tracker_cost",
        title: "估算排名检查成本",
        description: "预估一次手动排名检查的成本。",
      },
      {
        name: "run_rank_tracker",
        title: "运行排名检查",
        description: "立即检查追踪器中的当前排名。",
      },
      {
        name: "get_keyword_metrics",
        title: "获取关键词指标",
        description: "获取任意关键词列表的搜索量、难度、意图、CPC 和趋势。",
      },
      {
        name: "list_saved_keywords",
        title: "获取已保存关键词",
        description: "读取已保存的关键词列表。",
      },
      {
        name: "save_keywords",
        title: "保存关键词",
        description: "将关键词保存到 OpenSEO。",
      },
    ],
  },
  {
    label: "竞争研究",
    tools: [
      {
        name: "get_serp_results",
        title: "获取 SERP 结果",
        description: "查看关键词的实时 Google 搜索结果。",
      },
      {
        name: "find_serp_competitors",
        title: "查找 SERP 竞争对手",
        description: "基于一组关键词比较多个域名。",
      },
      {
        name: "get_ranked_keywords",
        title: "获取有排名的关键词",
        description: "查找具体的关键词、页面和排名记录。",
      },
      {
        name: "get_domain_overview",
        title: "获取域名概览",
        description: "汇总域名的自然搜索表现。",
      },
      {
        name: "get_domain_keyword_suggestions",
        title: "获取域名关键词",
        description: "查找域名已获得排名的关键词。",
      },
      {
        name: "get_backlinks_overview",
        title: "获取反向链接概览",
        description: "检查反向链接和引用域名数据。",
      },
      {
        name: "get_backlinks_profile",
        title: "获取反向链接详情",
        description: "分页获取链接级反向链接记录。",
      },
    ],
  },
  {
    label: "本地商家",
    tools: [
      {
        name: "search_local_businesses",
        title: "搜索本地商家",
        description: "查找指定坐标附近的本地商家。",
      },
      {
        name: "get_local_serp_results",
        title: "获取本地 SERP 结果",
        description: "获取一组地图或本地搜索结果。",
      },
      {
        name: "get_google_business_questions",
        title: "获取商家问答",
        description: "读取 Google 商家资料问答记录。",
      },
    ],
  },
  {
    label: "Search Console",
    tools: [
      {
        name: "get_search_console_performance",
        title: "获取 Search Console 表现",
        description: "读取 Search Console 的点击、展示、CTR 和排名数据。",
      },
      {
        name: "inspect_urls",
        title: "检查网址",
        description: "检查最多 10 个网址的索引状态、抓取和规范网址。",
      },
    ],
  },
  {
    label: "Google Analytics",
    tools: [
      {
        name: "get_google_analytics_organic_overview",
        title: "获取自然搜索概览",
        description: "对比当前周期与上一周期的自然搜索核心表现。",
      },
      {
        name: "get_google_analytics_organic_landing_pages",
        title: "获取自然搜索落地页",
        description: "按落地页读取自然搜索会话、互动、关键事件和收入。",
      },
      {
        name: "get_google_analytics_page_performance",
        title: "获取页面表现",
        description: "读取页面浏览量、用户数、互动时长和关键事件。",
      },
      {
        name: "get_google_analytics_key_events",
        title: "获取关键事件",
        description: "按事件或落地页读取关键事件结果。",
      },
      {
        name: "get_search_opportunities",
        title: "获取搜索机会",
        description:
          "结合 Search Console 需求和 Analytics 结果确定页面优先级。",
      },
      {
        name: "get_google_analytics_traffic_acquisition",
        title: "获取流量获取数据",
        description: "基于会话结果比较渠道、来源/媒介或广告系列。",
      },
      {
        name: "get_google_analytics_measurement_health",
        title: "检查衡量设置",
        description: "检查数据流、增强型衡量、关键事件和自定义定义。",
      },
      {
        name: "get_google_analytics_ecommerce_performance",
        title: "获取电商表现",
        description: "读取商品漏斗或落地页交易表现。",
      },
      {
        name: "get_google_analytics_site_search",
        title: "获取站内搜索",
        description: "读取已衡量的站内搜索词和结果。",
      },
      {
        name: "get_google_analytics_audience_breakdown",
        title: "获取受众细分",
        description: "比较设备、国家或地区、新访客与回访用户等受众。",
      },
    ],
  },
];

const visibleCategories = GA4_OAUTH_APP_PENDING
  ? toolCategories.filter((cat) => cat.label !== "Google Analytics")
  : toolCategories;

export function AvailableTools() {
  return (
    <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
      {visibleCategories.map((cat) => (
        <div key={cat.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
            {cat.label}
          </h3>
          <ul className="mt-3 space-y-3">
            {cat.tools.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-base-content">
                  {tool.title}
                </span>
                <p className="text-xs text-base-content/60 leading-relaxed">
                  {tool.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

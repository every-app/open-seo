/** Classify Vercel referrer hostnames for the Traffic page. "Others" is
 *  Vercel's literal tail bucket and "" is direct traffic — neither is a real
 *  hostname, so both stay unbadged. */

const SEARCH_HOSTS = new Set([
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "search.brave.com",
  "ecosia.org",
  "yandex.ru",
  "yandex.com",
  "baidu.com",
  "startpage.com",
  "qwant.com",
  "search.yahoo.com",
]);

const AI_HOSTS = new Set([
  "claude.ai",
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "perplexity.ai",
  "www.perplexity.ai",
  "copilot.microsoft.com",
  "doubao.com",
  "kimi.com",
  "chat.deepseek.com",
  "grok.com",
]);

function normalize(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

export function isSearchReferrer(hostname: string): boolean {
  return SEARCH_HOSTS.has(normalize(hostname));
}

export function isAiReferrer(hostname: string): boolean {
  return AI_HOSTS.has(normalize(hostname)) || AI_HOSTS.has(hostname);
}

export function referrerLabel(hostname: string): string {
  if (hostname === "") return "Direct / none";
  return hostname;
}

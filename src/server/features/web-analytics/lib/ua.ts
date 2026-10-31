// User-agent classification: bot filtering plus browser/OS/device parsing for
// the visitor breakdowns.
//
// Ported from Minilytics (MIT, Copyright (c) 2026 surendrapandar)
// https://github.com/surendrapandar/minilytics/blob/main/src/worker/lib/ua.ts

interface ParsedUA {
  browser: string;
  os: string;
  device: "Desktop" | "Mobile" | "Tablet";
}

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|vercel|chatgpt-user|gptbot|claudebot|perplexity|bytespider|ahrefs|semrush|mj12|dotbot/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

// Order matters: in-app browsers and Chromium forks before Chrome, Chrome
// before Safari.
const BROWSERS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/Twitter/i, "Twitter"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Threads/i, "Threads"],
  [/TikTok|musical_ly|Bytedance/i, "TikTok"],
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/YaBrowser/, "Yandex"],
  [/Vivaldi/, "Vivaldi"],
  [/Brave/, "Brave"],
  [/DuckDuckGo/, "DuckDuckGo"],
  [/Arc\//, "Arc"],
  [/Firefox|FxiOS/, "Firefox"],
  [/; wv\)/, "Chrome WebView"],
  [/Chrome|CriOS/, "Chrome"],
  [/Mobile\/\w+ Safari|Version\/[\d.]+ Mobile/, "Mobile Safari"],
  [/Safari/, "Safari"],
  [/AppleWebKit/, "WebKit"],
];

const OSES: [RegExp, string][] = [
  [/iPhone|iPod/, "iOS"],
  [/iPad/, "iPadOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/CrOS/, "Chrome OS"],
  [/Mac OS X|Macintosh/, "Mac OS"],
  [/Linux/, "Linux"],
];

export function parseUA(ua: string, screenWidth?: number): ParsedUA {
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "Other";
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? "Other";
  let device: ParsedUA["device"] = "Desktop";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)))
    device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = "Mobile";
  // Desktop UA on a phone-sized screen is a mobile browser pretending.
  if (device === "Desktop" && screenWidth && screenWidth < 600)
    device = "Mobile";
  return { browser, os, device };
}

import { QueueItem } from "./types";

type PageMetadata = {
  finalUrl: string;
  title: string;
  description: string;
  textSample: string;
  fetchOk: boolean;
};

const DEFAULT_FETCH_TIMEOUT_MS = 4500;
const DEFAULT_MAX_URLS = 20;

const highRelevanceWords = [
  "guide",
  "tutorial",
  "reference",
  "docs",
  "documentation",
  "learn",
  "how to",
  "research",
  "analysis",
  "case study",
  "best practices",
  "security",
  "performance",
  "productivity"
];

const lowRelevanceWords = ["sale", "coupon", "ad", "sponsored", "newsletter", "login", "signup"];

export function getMaxUrls(): number {
  const parsed = Number.parseInt(process.env.MAX_URLS_PER_QUEUE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_URLS;
}

function getFetchTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.FETCH_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

export function parseUrls(input: string): string[] {
  const rawParts = input
    .split(/[\s,]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const part of rawParts) {
    const normalized = normalizeUrl(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return urls.slice(0, getMaxUrls());
}

function normalizeUrl(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function buildQueueItems(urls: string[]): Promise<QueueItem[]> {
  const items = await Promise.all(urls.map((url) => buildQueueItem(url)));
  return items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

async function buildQueueItem(url: string): Promise<QueueItem> {
  const metadata = await fetchPageMetadata(url);
  const title = metadata.title || titleFromUrl(metadata.finalUrl || url);
  const summary = summarize(metadata, title);
  const score = scoreItem(metadata, title, summary);

  return {
    id: stableId(url),
    url: metadata.finalUrl || url,
    title,
    summary,
    score,
    createdAt: new Date().toISOString()
  };
}

async function fetchPageMetadata(url: string): Promise<PageMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getFetchTimeoutMs());

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "QuietQueueBot/0.1 (+https://example.local)",
        accept: "text/html,application/xhtml+xml"
      }
    });
    const contentType = response.headers.get("content-type") ?? "";
    const finalUrl = response.url || url;

    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return fallbackMetadata(finalUrl, false);
    }

    const html = await response.text();
    return {
      finalUrl,
      title: cleanText(extractTitle(html)),
      description: cleanText(extractMeta(html, "description") || extractMeta(html, "og:description")),
      textSample: cleanText(extractTextSample(html)),
      fetchOk: true
    };
  } catch {
    return fallbackMetadata(url, false);
  } finally {
    clearTimeout(timer);
  }
}

function fallbackMetadata(url: string, fetchOk: boolean): PageMetadata {
  return {
    finalUrl: url,
    title: titleFromUrl(url),
    description: "",
    textSample: "",
    fetchOk
  };
}

function extractTitle(html: string): string {
  return extractMeta(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
}

function extractMeta(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return "";
}

function extractTextSample(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .slice(0, 3)
    .map((match) => match[1])
    .join(" ");
  return stripTags(`${heading} ${paragraphs}`).slice(0, 600);
}

function summarize(metadata: PageMetadata, title: string): string {
  if (metadata.description) return truncateSentence(metadata.description, 190);
  if (metadata.textSample) return truncateSentence(metadata.textSample, 190);
  const host = safeHost(metadata.finalUrl);
  if (!metadata.fetchOk) {
    return `Could not fetch page metadata, but this appears to be a reading item from ${host}. Open it when the title looks relevant.`;
  }
  return `A saved reading item from ${host}: ${title}.`;
}

function scoreItem(metadata: PageMetadata, title: string, summary: string): number {
  const text = `${title} ${summary} ${metadata.finalUrl}`.toLowerCase();
  let score = 50;

  for (const word of highRelevanceWords) {
    if (text.includes(word)) score += 7;
  }
  for (const word of lowRelevanceWords) {
    if (text.includes(word)) score -= 8;
  }

  const wordCount = `${metadata.description} ${metadata.textSample}`.split(/\s+/).filter(Boolean).length;
  if (wordCount > 80) score -= 6;
  if (wordCount > 180) score -= 7;
  if (wordCount > 0 && wordCount <= 45) score += 7;

  const pathDepth = new URL(metadata.finalUrl).pathname.split("/").filter(Boolean).length;
  if (pathDepth >= 2) score += 4;
  if (metadata.fetchOk) score += 5;

  return Math.max(1, Math.min(100, Math.round(score)));
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastPart = parsed.pathname.split("/").filter(Boolean).pop();
    const source = lastPart || parsed.hostname.replace(/^www\./, "");
    return source
      .replace(/[-_]+/g, " ")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Untitled link";
  }
}

function cleanText(value: string): string {
  return decodeEntities(stripTags(value))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function truncateSentence(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength - 1);
  const sentenceEnd = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("! "), truncated.lastIndexOf("? "));
  if (sentenceEnd > 80) return `${truncated.slice(0, sentenceEnd + 1)}`;
  return `${truncated.trim()}…`;
}

function stableId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `item_${Math.abs(hash).toString(36)}`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the web";
  }
}

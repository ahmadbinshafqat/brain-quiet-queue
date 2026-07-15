import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import type { QueueItem, SavedQueue } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const QUEUE_STORE = path.join(DATA_DIR, "queues.json");

const priorityTerms = [
  "urgent",
  "security",
  "incident",
  "performance",
  "deadline",
  "migration",
  "release",
  "guide",
  "playbook",
  "research",
  "strategy",
  "accessibility"
];

export function parseUrlInput(input: string) {
  const tokens = input
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeUrl(token);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return urls;
}

function normalizeUrl(value: string) {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function buildQueue(urls: string[]) {
  const items = await Promise.all(urls.map(buildQueueItem));
  return items.sort((a, b) => b.priorityScore - a.priorityScore);
}

async function buildQueueItem(url: string): Promise<QueueItem> {
  const metadata = await fetchMetadata(url);
  const title = metadata.title || titleFromUrl(url);
  const description = metadata.description || metadata.snippet || `A saved link from ${new URL(url).hostname}.`;
  const summary = summarize(title, description, metadata.snippet);
  const priorityScore = scoreItem(url, title, description, metadata.snippet);
  const estimatedMinutes = estimateMinutes(description, metadata.snippet);
  const reason = priorityReason(priorityScore, title, description);

  return {
    url,
    title,
    description,
    summary,
    priorityScore,
    estimatedMinutes,
    reason
  };
}

async function fetchMetadata(url: string) {
  const timeoutMs = Number.parseInt(process.env.FETCH_TIMEOUT_MS ?? "4500", 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 4500);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "QuietQueue/1.0 (+https://example.local)"
      }
    });

    if (!response.ok) return {};

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return {};

    const html = await response.text();
    return {
      title: decodeHtml(extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || extractMeta(html, "og:title")),
      description: decodeHtml(extractMeta(html, "description") || extractMeta(html, "og:description")),
      snippet: decodeHtml(extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || extractFirst(html, /<p[^>]*>([\s\S]*?)<\/p>/i))
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byName = new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const byProperty = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  return extractFirst(html, byName) || extractFirst(html, byProperty);
}

function extractFirst(html: string, regex: RegExp) {
  const match = html.match(regex);
  return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function titleFromUrl(url: string) {
  const parsed = new URL(url);
  const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) return parsed.hostname.replace(/^www\./, "");
  return lastSegment
    .replace(/[-_]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summarize(title: string, description: string, snippet = "") {
  const source = [description, snippet].filter(Boolean).join(" ");
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) return `Read “${title}” and capture the important follow-up.`;
  return clean.length > 180 ? `${clean.slice(0, 177).trim()}...` : clean;
}

function scoreItem(url: string, title: string, description: string, snippet = "") {
  const text = `${url} ${title} ${description} ${snippet}`.toLowerCase();
  let score = 35;

  for (const term of priorityTerms) {
    if (text.includes(term)) score += 7;
  }

  if (text.includes("docs") || text.includes("developer")) score += 8;
  if (text.includes("blog") || text.includes("newsletter")) score -= 4;
  if (description.length > 120) score += 8;
  if (title.length > 10 && title.length < 90) score += 5;

  return Math.max(1, Math.min(100, score));
}

function estimateMinutes(description: string, snippet = "") {
  const words = `${description} ${snippet}`.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.min(15, Math.ceil(words / 180) + 2));
}

function priorityReason(score: number, title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  const matched = priorityTerms.find((term) => text.includes(term));
  if (matched) return `Boosted because it mentions ${matched}.`;
  if (score >= 60) return "Likely useful because it has strong metadata and context.";
  if (score >= 40) return "Solid follow-up item with enough context to review.";
  return "Lower priority because limited metadata was available.";
}

export function createShareToken(queue: QueueItem[]) {
  const digest = createHash("sha256")
    .update(JSON.stringify(queue.map((item) => [item.url, item.priorityScore])))
    .update(String(Date.now()))
    .digest("base64url");

  return digest.slice(0, 10);
}

async function readStore(): Promise<Record<string, SavedQueue>> {
  try {
    const raw = await fs.readFile(QUEUE_STORE, "utf8");
    return JSON.parse(raw) as Record<string, SavedQueue>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw error;
  }
}

async function writeStore(store: Record<string, SavedQueue>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(QUEUE_STORE, JSON.stringify(store, null, 2), "utf8");
}

export async function saveQueue(id: string, items: QueueItem[]) {
  const store = await readStore();
  const savedQueue: SavedQueue = {
    id,
    createdAt: new Date().toISOString(),
    items
  };
  store[id] = savedQueue;
  await writeStore(store);
  return savedQueue;
}

export async function loadSavedQueue(id: string) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  const store = await readStore();
  return store[id] ?? null;
}

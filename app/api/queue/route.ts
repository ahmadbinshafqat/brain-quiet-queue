import { NextRequest, NextResponse } from "next/server";
import {
  buildQueue,
  createShareToken,
  loadSavedQueue,
  parseUrlInput,
  saveQueue
} from "../../../lib/queue";
import type { QueueResponse } from "../../../lib/types";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing queue id." }, { status: 400 });
  }

  const savedQueue = await loadSavedQueue(id);

  if (!savedQueue) {
    return NextResponse.json({ error: "Queue link not found." }, { status: 404 });
  }

  const response: QueueResponse = {
    queue: savedQueue.items,
    shareId: savedQueue.id,
    shareUrl: `${getBaseUrl(request)}/?q=${encodeURIComponent(savedQueue.id)}`,
    createdAt: savedQueue.createdAt
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  let body: { urls?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.urls !== "string") {
    return NextResponse.json({ error: "Provide URLs as a string." }, { status: 400 });
  }

  const urls = parseUrlInput(body.urls);
  const maxUrls = Number.parseInt(process.env.MAX_URLS_PER_QUEUE ?? "20", 10);
  const limit = Number.isFinite(maxUrls) && maxUrls > 0 ? maxUrls : 20;

  if (urls.length === 0) {
    return NextResponse.json({ error: "Paste at least one valid URL." }, { status: 400 });
  }

  if (urls.length > limit) {
    return NextResponse.json(
      { error: `Please submit ${limit} URLs or fewer.` },
      { status: 400 }
    );
  }

  const queue = await buildQueue(urls);
  const shareId = createShareToken(queue);
  const savedQueue = await saveQueue(shareId, queue);

  const response: QueueResponse = {
    queue,
    shareId: savedQueue.id,
    shareUrl: `${getBaseUrl(request)}/?q=${encodeURIComponent(savedQueue.id)}`,
    createdAt: savedQueue.createdAt
  };

  return NextResponse.json(response);
}

import { NextResponse } from "next/server";
import { buildQueueItems, parseUrls } from "@/lib/queue";
import { Queue } from "@/lib/types";

export const dynamic = "force-dynamic";

type RequestBody = {
  urls?: string;
  name?: string;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urls = parseUrls(body.urls ?? "");
  if (urls.length === 0) {
    return NextResponse.json({ error: "Paste at least one valid URL." }, { status: 400 });
  }

  const items = await buildQueueItems(urls);
  const queue: Queue = {
    id: `queue_${Date.now().toString(36)}`,
    name: body.name?.trim() || "Today's quiet queue",
    items
  };

  return NextResponse.json(queue);
}

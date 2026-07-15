"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { QueueItem, QueueResponse } from "../lib/types";

type LoadState = "idle" | "loading" | "success" | "error";

const exampleInput = `https://www.nngroup.com/articles/reading-patterns/
https://developer.mozilla.org/en-US/docs/Web/Performance
https://www.atlassian.com/team-playbook/plays`; 

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function HomePage() {
  const [input, setInput] = useState(exampleInput);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [createdAt, setCreatedAt] = useState<string | undefined>();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy link");

  const hasQueue = items.length > 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queueId = params.get("q");
    if (!queueId) return;

    const controller = new AbortController();
    setState("loading");
    setError("");

    fetch(`/api/queue?id=${encodeURIComponent(queueId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load this shared queue.");
        }
        return data as QueueResponse;
      })
      .then((data) => {
        setItems(data.queue);
        setShareUrl(data.shareUrl ?? window.location.href);
        setCreatedAt(data.createdAt);
        setState("success");
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(err.message);
        setState("error");
      });

    return () => controller.abort();
  }, []);

  const totalMinutes = useMemo(
    () => items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    [items]
  );

  async function generateQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError("");
    setCopyLabel("Copy link");

    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: input })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not build queue.");
      }

      const queueResponse = data as QueueResponse;
      setItems(queueResponse.queue);
      setShareUrl(queueResponse.shareUrl ?? "");
      setCreatedAt(queueResponse.createdAt);
      setState("success");

      if (queueResponse.shareId) {
        const nextPath = `/?q=${encodeURIComponent(queueResponse.shareId)}`;
        window.history.replaceState(null, "", nextPath);
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy link"), 1800);
    } catch {
      setCopyLabel("Select link");
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Quiet Queue</p>
        <h1>Turn noisy links into a calm, shareable reading queue.</h1>
        <p className="lede">
          Paste URLs, get a prioritized queue, then copy a compact link to reopen it later
          or hand it to someone else.
        </p>
      </section>

      <section className="panel">
        <form onSubmit={generateQueue} className="queue-form">
          <label htmlFor="urls">URLs</label>
          <textarea
            id="urls"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste links separated by new lines, spaces, or commas"
            rows={8}
          />
          <div className="form-actions">
            <button type="submit" disabled={state === "loading"}>
              {state === "loading" ? "Building queue..." : "Generate queue"}
            </button>
            <span className="hint">One link per line works best.</span>
          </div>
        </form>
      </section>

      {error ? <div className="alert">{error}</div> : null}

      {hasQueue ? (
        <section className="results">
          <div className="results-header">
            <div>
              <p className="eyebrow">Your queue</p>
              <h2>{items.length} links · about {totalMinutes} min</h2>
              {createdAt ? <p className="muted">Saved {formatDate(createdAt)}</p> : null}
            </div>
            {shareUrl ? (
              <div className="share-card" aria-label="Shareable queue link">
                <span>Share link</span>
                <input readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
                <button type="button" onClick={copyShareLink}>{copyLabel}</button>
              </div>
            ) : null}
          </div>

          <ol className="queue-list">
            {items.map((item, index) => (
              <li key={`${item.url}-${index}`} className="queue-item">
                <div className="rank">{index + 1}</div>
                <div className="item-body">
                  <div className="item-title-row">
                    <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                    <span className="score">{item.priorityScore}/100</span>
                  </div>
                  <p>{item.summary}</p>
                  <div className="meta-row">
                    <span>{item.estimatedMinutes} min read</span>
                    <span>{item.reason}</span>
                  </div>
                  <small>{item.url}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

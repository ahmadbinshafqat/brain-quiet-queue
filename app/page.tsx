"use client";

import { FormEvent, useMemo, useState } from "react";
import { Queue } from "@/lib/types";

const sampleLinks = `https://nextjs.org/docs
https://www.nngroup.com/articles/how-users-read-on-the-web/
https://developer.mozilla.org/en-US/docs/Web/Performance`;

export default function HomePage() {
  const [urls, setUrls] = useState(sampleLinks);
  const [queueName, setQueueName] = useState("Weekend reading reset");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const urlCount = useMemo(() => urls.split(/[\s,]+/g).filter(Boolean).length, [urls]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setQueue(null);

    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls, name: queueName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build queue.");
      setQueue(data as Queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Personal productivity · calm tab triage</p>
          <h1>Turn tab chaos into a quiet reading queue.</h1>
          <p className="subtitle">
            Paste messy links, then get short summaries and a sorted priority list based on relevance,
            clarity, and estimated reading effort.
          </p>
        </div>
      </section>

      <section className="workspace">
        <form className="composer" onSubmit={handleSubmit}>
          <label>
            Queue name
            <input value={queueName} onChange={(event) => setQueueName(event.target.value)} placeholder="Today's queue" />
          </label>
          <label>
            Links
            <textarea
              value={urls}
              onChange={(event) => setUrls(event.target.value)}
              rows={10}
              placeholder="Paste URLs here — one per line works best."
            />
          </label>
          <div className="formFooter">
            <span>{urlCount} pasted link{urlCount === 1 ? "" : "s"}</span>
            <button type="submit" disabled={loading}>{loading ? "Prioritizing…" : "Build quiet queue"}</button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <div className="queuePanel">
          {!queue ? (
            <div className="emptyState">
              <span className="emptyIcon">☕</span>
              <h2>Your calm queue will appear here.</h2>
              <p>Higher scores rise to the top. Fetching can take a few seconds depending on the sites.</p>
            </div>
          ) : (
            <section>
              <div className="queueHeader">
                <div>
                  <p className="eyebrow">Sorted queue</p>
                  <h2>{queue.name}</h2>
                </div>
                <span className="pill">{queue.items.length} items</span>
              </div>
              <ol className="items">
                {queue.items.map((item, index) => (
                  <li key={item.id} className="itemCard">
                    <div className="rank">#{index + 1}</div>
                    <div className="itemBody">
                      <div className="itemTopline">
                        <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                        <span className="score">{item.score}</span>
                      </div>
                      <p>{item.summary}</p>
                      <small>{new URL(item.url).hostname.replace(/^www\./, "")}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

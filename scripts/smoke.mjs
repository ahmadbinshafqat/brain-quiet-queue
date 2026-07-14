const endpoint = process.env.QUIET_QUEUE_URL || "http://localhost:3000/api/queue";

async function run() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Smoke test queue",
      urls: "https://nextjs.org/docs https://developer.mozilla.org/en-US/docs/Web/JavaScript"
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Smoke test failed with ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data.items || data.items.length !== 2) {
    throw new Error(`Expected 2 queue items, got ${JSON.stringify(data)}`);
  }

  const scores = data.items.map((item) => item.score);
  if (!scores.every((score) => typeof score === "number" && score >= 1 && score <= 100)) {
    throw new Error(`Invalid scores: ${scores.join(", ")}`);
  }

  console.log("Smoke test passed: /api/queue returned prioritized queue items.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

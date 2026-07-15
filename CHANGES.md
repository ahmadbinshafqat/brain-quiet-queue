# Changes: Shareable Queue Links

Added shareable queue links to Quiet Queue.

## What changed

- `POST /api/queue` now saves each generated queue to local JSON storage and returns a compact share URL token.
- `GET /api/queue?id=...` loads a previously generated queue by token.
- The main UI now:
  - restores queues from `?q=<token>` URLs,
  - displays a copyable share link after generation,
  - supports re-copying the current share link,
  - keeps the original paste-and-generate flow intact.
- Queue-related shared types now include persisted queue metadata.
- Local queue persistence is implemented in `lib/queue.ts` using `.data/queues.json`.

## Integration notes

No new packages are required. The existing run flow still works:

```bash
npm install
npm run dev
```

Generated queues are stored locally on the server filesystem in `.data/queues.json`. In local development this persists across server restarts. On stateless deployments, use a persistent filesystem or replace the storage helpers in `lib/queue.ts` with a managed data store.

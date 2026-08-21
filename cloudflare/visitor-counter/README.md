# Visitor counter Worker

This Worker backs the homepage's `TOTAL VISITS · SINCE AUG 2026` display.

- One random browser session is generated for eight hours by the homepage script.
- Only the SHA-256 digest of that random session identifier is stored in D1.
- IP addresses, user agents, referrers, and page paths are not stored.
- A D1 trigger increments the total only when a new session digest is inserted, so retries are idempotent.
- The homepage fails closed visually: if the service is unavailable, the counter hides and the rest of the page remains unaffected.

The production resources are declared in `wrangler.jsonc`:

- Worker: `zgj19stat-visitor-counter`
- D1 database: `zgj19stat-visitors`
- Endpoint: `https://zgj19stat-visitor-counter.zgj19stat.workers.dev`

For a future redeployment, apply `schema.sql` to the configured D1 database and deploy from this directory with Wrangler. The public endpoint is also recorded in the site's `_config.yml`; no account token or other secret is committed to the repository.

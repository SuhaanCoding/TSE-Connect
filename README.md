# TSE Connect

TSE alumni directory built with Next.js and Supabase.

## Local development

Install the locked dependencies with `npm ci`. Configure an ignored `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the existing Supabase project. Never commit these keys. Run `npm run dev`.

Apply the SQL files in `supabase/migrations` in timestamp order before deploying the related app code. The November 2026 profile migrations have been applied to the current production project. Keep existing RLS policies in place.

## Profiles and matching

Members can save an optional plain-text bio (1,000 characters) and up to ten keywords (40 characters each) in Settings. Names, roles and company lookup continue to work. Search and recommendations use field-weighted TF-IDF cosine similarity: explicit keywords and bios outweigh scraped background, specific phrases count, common words are discounted, repetition is capped, and domain acronyms (ML, RL, LLM, NLP, AI, UX/UI) map to canonical concepts. Personal recommendations compare the member's bio and keywords with other opted-in alumni, explain shared phrases and expand from three cards to all returned matches (up to 100).

Matching runs on the server with the authenticated roster; no paid AI service receives profile text. It uses curated domain equivalents and phrases, not semantic embeddings or unrestricted synonym inference. Shared contact addresses do not count as interests. Login metadata and contact visibility are sanitized; recommendation card responses omit the full scraped background.

Company history and LinkedIn background are scraper-owned. A profile save preserves omitted fields and cannot overwrite current/past companies, scraped About text or scraped job/project descriptions. Members update LinkedIn and wait for a refresh to change that information. Existing elevated administrative tools retain their operational access.

## LinkedIn refresh

The application uses `insights_data/linkedin-profile-extractor-enricher`, pinned to build `1.0.6`. `APIFY_ACTOR_ID` and `APIFY_ACTOR_BUILD` can override these only after compatibility review. The current adapter expects the actor's `urls` input, `currentPosition`, `about`, `experience` and `projects` output. It also reads older HarvestAPI datasets.

Set `APIFY_API_TOKEN` for scraping. Existing automatic callbacks use `APIFY_WEBHOOK_SECRET`; the scheduled endpoint uses the existing `SYNC_SECRET_KEY`. Public profile URLs are deduplicated before submission and regional LinkedIn domains are normalized. Matching duplicate roster entries all receive the same refresh.

At verification, the selected actor charged $0.005 per successful profile on the Apify Free plan, plus platform usage. The code checks live actor pricing, rejects subscription pricing or unexpected charge events, and caps actor charges at $2 per run. It rejects successful-looking free-plan caps instead of importing a truncated run. Apify's Free account also has its own monthly credit limit; no plan upgrade or top-up is performed by this app.

Only visible, nonempty data is imported. Masked employers are discarded; incomplete work history cannot erase a complete saved history. LinkedIn About, job descriptions and project descriptions are stored separately from member-authored bio and keywords. Blocked or hidden profiles retain their previous data and are reported as skipped. An actor cannot guarantee access to descriptions hidden by LinkedIn.

The existing admin Scrape tab starts manual runs and catches up completed callbacks. The existing scheduled endpoint uses the same adapter. Actor marketplace rules can change; pinned builds and pricing/output guards make those changes visible but cannot guarantee a provider will remain available.

## Recovery and import receipts

Apply `20261110090000_scrape_recovery.sql` before this release. Runs reserve a unique active database slot before actor start; import processing uses a five-minute lease and persisted phase receipts. The primary provider is followed by at most one automatic fallback for unresolved roster URLs, using `blueskyscraper/linkedin-profile-details-scraper` build `0.1.36`, verified Free pricing at $0.0032/profile and a $1 actor cap. Email enrichment is disabled. A lost/uncertain start is surfaced for review rather than automatically spending again.

Requested and returned URLs are both matched. Stable numeric LinkedIn member IDs can link cross-provider aliases and recover canonical addresses; names alone never join records. Error rows, masks and identity-only results do not receive a fresh timestamp. Only visible, validated fields are written, and incomplete history never clears stored employers. Each input has a receipt showing provider, updated fields, roster IDs and any unresolved reason. History distinguishes partial from complete results and offers per-profile review and a manual retry of unresolved roster profiles. Direct browser roles cannot read operational receipts; admin APIs authenticate and use the service client.

When `APIFY_WEBHOOK_SECRET` is configured, callbacks are attached atomically in the actor-start request ([Apify Run Actor documentation](https://docs.apify.com/api/v2/actors-runs-post)). Webhooks and the admin poller use the same processor. If callbacks are not configured, the admin page says so and must stay open to finish processing. Transient import failures keep the run resumable and release its lease. Duplicate callbacks cannot overwrite completed runs or start repeated fallback actors.

## Checks

- `npm test` — keyword/bio validation, ownership protection, cosine ranking, recommendation privacy, scraper adapters and cost/truncation guards.
- `npm run typecheck`
- `npm run lint`
- `npm run build`

The test suite includes the actual import workflow with fake I/O boundaries: duplicate callbacks, overlapping run reservations, lease contention, transient read failures, foreign datasets and unconfirmed recovery starts. `tests/scrape-database-smoke.sql` verifies database reservation/lease/access rules in a rollback-only transaction; run it only when no real scrape is active.

Browser QA covers Settings save/reload, failed-save recovery, read-only company fields, tag navigation, free-text search, recommendations, no-results/clear, keyboard focus and a 390px viewport using fictional profiles in an isolated copy. Supabase permissions, limits and search are also tested in transactions that roll back their test changes.

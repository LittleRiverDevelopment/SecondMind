# Architecture

Signal Library is a Next.js App Router application for one owner.

Pages and server actions call `readOwnerSession`. Demo and local modes use an HMAC cookie. Supabase mode calls `getUser()` and allows only `OWNER_EMAIL` plus `OWNER_ID`. `proxy.ts` is a coarse gate. Missing production configuration returns 503.

Postgres is the system of record. `db/migrations/001_init.sql` creates the tables, pgvector column (`vector(256)`), and owner RLS policies. PGlite is the default local database so demo mode does not need a server. `DATABASE_URL` selects Postgres through `postgres` instead. Demo mode will not open `DATABASE_URL`.

`AiProvider` is the only path to extraction, embeddings, answers, digests, and briefs. Model names come from the environment. The mock provider is used when `APP_MODE=demo` or `AI_PROVIDER=mock`, and its UI says so. `AI_PROVIDER=openai` fails when the key is missing.

Capture inserts the original input and a queued job. `lib/processing/pipeline.ts` extracts a public HTML page or keeps pasted text, validates a Zod summary, replaces chunks, and stores embeddings. URL checks live in `lib/extraction/ssrf.ts`: http(s), blocked addresses, DNS checks, manual redirects, size and content-type limits. HTML is parsed, not executed.

Library search and chat retrieval fuse keyword rank with cosine distance using reciprocal rank fusion (`k = 60`), then keep one chunk per item up to `CONTEXT_CHUNK_LIMIT` and `CONTEXT_CHAR_LIMIT`. Answers may cite only chunk ids from that set. Empty evidence becomes a fixed insufficient-evidence sentence.

Digests and project briefs record `source_dependencies`. Deleting a save removes its text, chunks, and jobs, and replaces dependent chat, digest, and brief bodies so cached snippets are not served. Briefs also go stale when assigned material changes. They refresh only from the project page.

Token counts are stored only when the provider response includes them. There is no cost estimate.

# Signal Library

Personal library for one owner. Save a link or some text, keep the original, and ask questions against what you saved.

This repository does not create a hosting account, Supabase, or an OpenAI key. Demo mode runs with synthetic data and a labeled preview model.

## Render

`render.yaml` describes one free web service. In the Render dashboard, confirm:

- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- `APP_MODE=demo`
- `DATABASE_URL` is empty

On Render, an empty `APP_MODE` boots the demo and leaves any linked `DATABASE_URL` unused. After this code is deployed, the site URL should show the sign-in page. In the Render dashboard, open **Manual Deploy** and choose the latest `main` commit if a deploy does not start on its own. The free instance sleeps after 15 minutes without visitors, and saved items disappear when it sleeps or redeploys. Open the service URL and choose **Continue as demo owner**.

## Demo mode

```bash
npm install
npm run build
APP_MODE=demo npm start
```

Open http://127.0.0.1:3000 and choose **Continue as demo owner**. The banner stays visible. Summaries, answers, digests, and briefs are deterministic previews, not OpenAI responses. Data lives in `.data/demo` (or `PGLITE_DIR`). Demo mode refuses to start when `DATABASE_URL` is set.

`npm run dev` does the same when `APP_MODE` is unset and `NODE_ENV` is not `production`.

## Local owner mode

Copy `.env.example` to `.env.local`. Set `APP_MODE=local`, a UUID `OWNER_ID`, `OWNER_EMAIL`, `OWNER_PASSWORD` (8+ characters), and `SESSION_SECRET` (16+ characters). Leave `AI_PROVIDER` unset to save without a model, set `AI_PROVIDER=mock` for labeled previews, or set `AI_PROVIDER=openai` with `OPENAI_API_KEY`. A missing key never switches a real request to the mock.

Without `DATABASE_URL`, data is stored with PGlite and pgvector in `.data/local`. With `DATABASE_URL`, the app uses that Postgres database. `docker compose up` starts `pgvector/pgvector:pg16`. Apply migrations with `npm run migrate`.

## Supabase

Set `APP_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `OWNER_ID` (the Supabase user id), `OWNER_EMAIL`, and `SESSION_SECRET`. The sign-in form accepts only that owner. There is no registration screen. Create the Supabase project and the user yourself. Row level security policies compare `owner_id` with `current_setting('app.owner_id')`. The server sets that inside a transaction and switches to the `signal_app` role when it exists. A Supabase service role bypasses RLS, so this app does not use one. The SQL owner filter still applies.

## Worker

Saving an item writes a `processing_jobs` row and returns. The request does not run the model.

- Demo mode and `INLINE_WORKER=true` poll that queue from the server process.
- Otherwise run `npm run worker` beside the app.

A job is leased with `FOR UPDATE SKIP LOCKED` for two minutes, up to three attempts. Hosting needs a process that can run `npm run worker` against the same database. Nothing here provisions a scheduler or sends email.

## Tests

```bash
npm test
npm run build && npx playwright install chromium && npm run test:e2e
```

Live OpenAI calls are not part of these tests.

## Limits

Public HTML only. X posts are not fetched. Private hosts, metadata addresses, and blocked redirects are refused. Deleting data removes it from this app and redacts dependent answers. It does not delete anything an AI provider may have stored.

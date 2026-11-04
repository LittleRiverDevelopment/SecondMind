CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.owner_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.owner_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  source_url text,
  url_key text,
  content_hash text,
  original_input jsonb NOT NULL,
  user_pasted_text text,
  extracted_text text,
  title text,
  author text,
  published_at timestamptz,
  user_note text,
  status text NOT NULL CHECK (status IN ('captured', 'processing', 'ready', 'needs_content', 'failed')),
  safe_error text,
  ai_summary text,
  ai_takeaways jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_provider text,
  summary_version integer NOT NULL DEFAULT 0,
  source_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(user_note, '') || ' ' ||
      coalesce(ai_summary, '') || ' ' ||
      coalesce(user_pasted_text, '') || ' ' ||
      coalesce(extracted_text, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS saved_items_owner_created_idx ON saved_items (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_items_owner_url_idx ON saved_items (owner_id, url_key);
CREATE INDEX IF NOT EXISTS saved_items_owner_hash_idx ON saved_items (owner_id, content_hash);
CREATE INDEX IF NOT EXISTS saved_items_search_idx ON saved_items USING gin (search_vector);

CREATE TABLE IF NOT EXISTS item_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES saved_items (id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  text text NOT NULL,
  embedding vector(256),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED,
  UNIQUE (item_id, ordinal)
);

CREATE INDEX IF NOT EXISTS item_chunks_search_idx ON item_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS item_chunks_owner_idx ON item_chunks (owner_id, item_id);

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  name_key text GENERATED ALWAYS AS (lower(name)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name_key)
);

CREATE TABLE IF NOT EXISTS item_topics (
  item_id uuid NOT NULL REFERENCES saved_items (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  confirmed boolean NOT NULL DEFAULT true,
  PRIMARY KEY (item_id, topic_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  research_question text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_owner_name_idx ON projects (owner_id, lower(name));

CREATE TABLE IF NOT EXISTS item_projects (
  item_id uuid NOT NULL REFERENCES saved_items (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  PRIMARY KEY (item_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  body text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at timestamptz NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  body text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  inferred jsonb NOT NULL DEFAULT '[]'::jsonb,
  applications jsonb NOT NULL DEFAULT '[]'::jsonb,
  insufficient boolean NOT NULL DEFAULT false,
  invalidated boolean NOT NULL DEFAULT false,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  range_start date NOT NULL,
  range_end date NOT NULL,
  project_id uuid,
  topic_id uuid,
  body jsonb NOT NULL,
  invalidated boolean NOT NULL DEFAULT false,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL,
  output_type text NOT NULL CHECK (output_type IN ('chat_message', 'digest', 'project_brief')),
  output_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_dependencies_item_idx ON source_dependencies (owner_id, item_id);
CREATE INDEX IF NOT EXISTS source_dependencies_output_idx ON source_dependencies (owner_id, output_type, output_id);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES saved_items (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'leased', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_queue_idx ON processing_jobs (owner_id, status, created_at);

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  provider text NOT NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'saved_items',
    'item_chunks',
    'topics',
    'item_topics',
    'projects',
    'item_projects',
    'project_briefs',
    'chat_sessions',
    'chat_messages',
    'digests',
    'source_dependencies',
    'processing_jobs',
    'ai_usage'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY owner_isolation ON %I USING (owner_id = app.owner_id()) WITH CHECK (owner_id = app.owner_id())',
      tbl
    );
  END LOOP;
END $$;

import { createHash } from "node:crypto";
import type { Sql, SqlRow } from "@/lib/db/sql";
import type {
  ChatMessage,
  ChatSession,
  ChunkHit,
  Digest,
  DigestBody,
  ItemFilter,
  ItemStatus,
  LibraryStats,
  ProcessingJob,
  Project,
  ProjectBrief,
  ProjectStatus,
  SavedItem,
  SuggestedTopic,
  Topic,
  UsageRow,
} from "@/lib/db/types";
import { asObject, isoDate } from "@/lib/text";
import { EMBEDDING_DIMENSIONS } from "@/lib/config";

const REDACTED = "A cited source was deleted, so this response was removed.";
const REDACTED_DIGEST: DigestBody = {
  themes: [],
  takeaways: [],
  connections: [],
  applications: [],
  gaps: [REDACTED],
  empty: true,
};

export class StoreError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "conflict" | "invalid",
  ) {
    super(message);
  }
}

function text(value: unknown) {
  return value == null ? null : String(value);
}

function mapItem(row: SqlRow, topics: SavedItem["topics"], projects: SavedItem["projects"]): SavedItem {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    sourceUrl: text(row.source_url),
    originalInput: asObject(row.original_input, {}),
    userPastedText: text(row.user_pasted_text),
    extractedText: text(row.extracted_text),
    title: text(row.title),
    author: text(row.author),
    publishedAt: isoDate(row.published_at as string | Date | null),
    userNote: text(row.user_note),
    status: row.status as ItemStatus,
    safeError: text(row.safe_error),
    aiSummary: text(row.ai_summary),
    aiTakeaways: asObject<string[]>(row.ai_takeaways, []),
    suggestedTopics: asObject<SuggestedTopic[]>(row.suggested_topics, []),
    summaryProvider: text(row.summary_provider),
    summaryVersion: Number(row.summary_version ?? 0),
    sourceVersion: Number(row.source_version ?? 1),
    createdAt: isoDate(row.created_at as string | Date) ?? new Date(0).toISOString(),
    updatedAt: isoDate(row.updated_at as string | Date) ?? new Date(0).toISOString(),
    topics,
    projects,
  };
}

function vectorLiteral(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value))) {
    throw new StoreError("Embedding has the wrong shape.", "invalid");
  }
  return `[${values.join(",")}]`;
}

function isUnique(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
}

export function createLibraryStore(sql: Sql, ownerId: string, restrictedRole: boolean) {
  async function withOwner<T>(fn: (tx: Sql) => Promise<T>) {
    return sql.transaction(async (tx) => {
      if (restrictedRole) await tx.exec("SET LOCAL ROLE signal_app");
      await tx.query("SELECT set_config('app.owner_id', $1, true)", [ownerId]);
      return fn(tx);
    });
  }

  async function hydrate(tx: Sql, rows: SqlRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const topicRows = await tx.query(
      `SELECT it.item_id, t.id, t.name, it.confirmed
       FROM item_topics it
       JOIN topics t ON t.id = it.topic_id
       WHERE it.owner_id = $1 AND it.item_id IN (${ids.map((_, index) => `$${index + 2}`).join(", ")})`,
      [ownerId, ...ids],
    );
    const projectRows = await tx.query(
      `SELECT ip.item_id, p.id, p.name
       FROM item_projects ip
       JOIN projects p ON p.id = ip.project_id
       WHERE ip.owner_id = $1 AND ip.item_id IN (${ids.map((_, index) => `$${index + 2}`).join(", ")})`,
      [ownerId, ...ids],
    );
    return rows.map((row) =>
      mapItem(
        row,
        topicRows
          .filter((topic) => String(topic.item_id) === String(row.id))
          .map((topic) => ({
            id: String(topic.id),
            name: String(topic.name),
            confirmed: Boolean(topic.confirmed),
          })),
        projectRows
          .filter((project) => String(project.item_id) === String(row.id))
          .map((project) => ({ id: String(project.id), name: String(project.name) })),
      ),
    );
  }

  function filterClauses(filter: ItemFilter, readyOnly: boolean, params: unknown[]) {
    const clauses = ["i.owner_id = $1"];
    if (readyOnly) clauses.push("i.status = 'ready'");
    else if (filter.status) {
      params.push(filter.status);
      clauses.push(`i.status = $${params.length}`);
    }
    if (filter.topicId) {
      params.push(filter.topicId);
      clauses.push(
        `EXISTS (SELECT 1 FROM item_topics it WHERE it.item_id = i.id AND it.topic_id = $${params.length} AND it.confirmed = true)`,
      );
    }
    if (filter.projectId) {
      params.push(filter.projectId);
      clauses.push(
        `EXISTS (SELECT 1 FROM item_projects ip WHERE ip.item_id = i.id AND ip.project_id = $${params.length})`,
      );
    }
    if (filter.from) {
      params.push(filter.from);
      clauses.push(`i.created_at >= $${params.length}::date`);
    }
    if (filter.to) {
      params.push(filter.to);
      clauses.push(`i.created_at < ($${params.length}::date + interval '1 day')`);
    }
    return clauses;
  }

  return {
    ownerId,

    async findDuplicate(urlKey: string | null, hash: string | null) {
      if (!urlKey && !hash) return null;
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `SELECT * FROM saved_items
           WHERE owner_id = $1
             AND (($2::text IS NOT NULL AND url_key = $2) OR ($3::text IS NOT NULL AND content_hash = $3))
           ORDER BY created_at
           LIMIT 1`,
          [ownerId, urlKey, hash],
        );
        const [item] = await hydrate(tx, rows);
        return item ?? null;
      });
    },

    async createItem(input: {
      sourceUrl: string | null;
      urlKey: string | null;
      contentHash: string | null;
      originalInput: SavedItem["originalInput"];
      userPastedText: string | null;
      title: string | null;
      userNote: string | null;
      topicIds: string[];
      projectId: string | null;
    }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO saved_items (
             owner_id, source_url, url_key, content_hash, original_input, user_pasted_text, title, user_note, status
           ) VALUES (
             $1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'captured'
           ) RETURNING *`,
          [
            ownerId,
            input.sourceUrl,
            input.urlKey,
            input.contentHash,
            JSON.stringify(input.originalInput),
            input.userPastedText,
            input.title,
            input.userNote,
          ],
        );
        const itemId = String(rows[0]?.id);
        await tx.query(
          `INSERT INTO processing_jobs (owner_id, item_id, status) VALUES ($1, $2, 'queued')`,
          [ownerId, itemId],
        );
        for (const topicId of input.topicIds) {
          await tx.query(
            `INSERT INTO item_topics (item_id, topic_id, owner_id, confirmed) VALUES ($1, $2, $3, true)`,
            [itemId, topicId, ownerId],
          );
        }
        if (input.projectId) {
          await tx.query(
            `INSERT INTO item_projects (item_id, project_id, owner_id) VALUES ($1, $2, $3)`,
            [itemId, input.projectId, ownerId],
          );
        }
        const [item] = await hydrate(tx, rows);
        return item!;
      });
    },

    async listItems(filter: ItemFilter = {}) {
      return withOwner(async (tx) => {
        const params: unknown[] = [ownerId];
        const clauses = filterClauses(filter, false, params);
        if (filter.query) {
          params.push(filter.query);
          const queryParam = `$${params.length}`;
          params.push(`%${filter.query.replace(/[%_]/g, "")}%`);
          const likeParam = `$${params.length}`;
          clauses.push(
            `(i.search_vector @@ websearch_to_tsquery('english', ${queryParam}) OR coalesce(i.title, '') ILIKE ${likeParam} OR coalesce(i.ai_summary, '') ILIKE ${likeParam} OR coalesce(i.user_pasted_text, '') ILIKE ${likeParam} OR coalesce(i.extracted_text, '') ILIKE ${likeParam})`,
          );
        }
        const direction = filter.sort === "oldest" ? "ASC" : "DESC";
        params.push(filter.limit ?? 100);
        const rows = await tx.query(
          `SELECT i.* FROM saved_items i WHERE ${clauses.join(" AND ")} ORDER BY i.created_at ${direction} LIMIT $${params.length}`,
          params,
        );
        return hydrate(tx, rows);
      });
    },

    async getItem(id: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM saved_items WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
        const [item] = await hydrate(tx, rows);
        return item ?? null;
      });
    },

    async updateItemMeta(id: string, patch: { title?: string; userNote?: string }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `UPDATE saved_items
           SET title = COALESCE($3, title),
               user_note = COALESCE($4, user_note),
               updated_at = now()
           WHERE owner_id = $1 AND id = $2
           RETURNING *`,
          [ownerId, id, patch.title ?? null, patch.userNote ?? null],
        );
        const [item] = await hydrate(tx, rows);
        if (!item) throw new StoreError("Item not found.", "not_found");
        return item;
      });
    },

    async addPastedText(id: string, text: string, hash: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `UPDATE saved_items
           SET user_pasted_text = $3,
               content_hash = $4,
               status = 'captured',
               safe_error = NULL,
               updated_at = now()
           WHERE owner_id = $1 AND id = $2
           RETURNING *`,
          [ownerId, id, text, hash],
        );
        if (!rows[0]) throw new StoreError("Item not found.", "not_found");
        await tx.query(
          `UPDATE processing_jobs
           SET status = 'queued', attempts = 0, leased_until = NULL, last_error = NULL, updated_at = now()
           WHERE owner_id = $1 AND item_id = $2`,
          [ownerId, id],
        );
        const [item] = await hydrate(tx, rows);
        return item!;
      });
    },

    async setItemProjects(id: string, projectIds: string[]) {
      return withOwner(async (tx) => {
        const existing = await tx.query(`SELECT project_id FROM item_projects WHERE owner_id = $1 AND item_id = $2`, [
          ownerId,
          id,
        ]);
        await tx.query(`DELETE FROM item_projects WHERE owner_id = $1 AND item_id = $2`, [ownerId, id]);
        for (const projectId of projectIds) {
          await tx.query(`INSERT INTO item_projects (item_id, project_id, owner_id) VALUES ($1, $2, $3)`, [
            id,
            projectId,
            ownerId,
          ]);
        }
        const affected = new Set([...existing.map((row) => String(row.project_id)), ...projectIds]);
        for (const projectId of affected) {
          await tx.query(`UPDATE project_briefs SET stale = true WHERE owner_id = $1 AND project_id = $2`, [
            ownerId,
            projectId,
          ]);
        }
      });
    },

    async leaseNext(): Promise<ProcessingJob | null> {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `WITH next_job AS (
             SELECT id FROM processing_jobs
             WHERE owner_id = $1
               AND attempts < max_attempts
               AND (status = 'queued' OR (status = 'leased' AND leased_until < now()))
             ORDER BY created_at
             FOR UPDATE SKIP LOCKED
             LIMIT 1
           )
           UPDATE processing_jobs AS job
           SET status = 'leased',
               attempts = job.attempts + 1,
               leased_until = now() + interval '2 minutes',
               updated_at = now()
           FROM next_job
           WHERE job.id = next_job.id
           RETURNING job.*`,
          [ownerId],
        );
        const row = rows[0];
        if (!row) return null;
        await tx.query(
          `UPDATE saved_items SET status = 'processing', updated_at = now() WHERE owner_id = $1 AND id = $2`,
          [ownerId, row.item_id],
        );
        return {
          id: String(row.id),
          itemId: String(row.item_id),
          status: "leased",
          attempts: Number(row.attempts),
          maxAttempts: Number(row.max_attempts),
          lastError: text(row.last_error),
        };
      });
    },

    async markNeedsContent(itemId: string, jobId: string, message: string) {
      await withOwner(async (tx) => {
        await tx.query(
          `UPDATE saved_items
           SET status = 'needs_content', safe_error = $3, updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, itemId, message],
        );
        await tx.query(
          `UPDATE processing_jobs
           SET status = 'succeeded', leased_until = NULL, last_error = NULL, updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, jobId],
        );
      });
    },

    async failAttempt(job: ProcessingJob, message: string) {
      const terminal = job.attempts >= job.maxAttempts;
      await withOwner(async (tx) => {
        await tx.query(
          `UPDATE processing_jobs
           SET status = $3, last_error = $4, leased_until = NULL, updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, job.id, terminal ? "failed" : "queued", message],
        );
        await tx.query(
          `UPDATE saved_items
           SET status = $3, safe_error = $4, updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, job.itemId, terminal ? "failed" : "captured", message],
        );
      });
    },

    async completeProcessing(input: {
      jobId: string;
      itemId: string;
      extractedText: string | null;
      title: string | null;
      author: string | null;
      publishedAt: string | null;
      contentHash: string | null;
      summary: string;
      takeaways: string[];
      suggestedTopics: SuggestedTopic[];
      provider: string;
      chunks: { text: string; embedding: number[] }[];
    }) {
      await withOwner(async (tx) => {
        await tx.query(
          `UPDATE saved_items
           SET extracted_text = COALESCE($3, extracted_text),
               title = COALESCE(title, $4),
               author = $5,
               published_at = $6::timestamptz,
               content_hash = COALESCE($7, content_hash),
               status = 'ready',
               safe_error = NULL,
               ai_summary = $8,
               ai_takeaways = $9::jsonb,
               suggested_topics = $10::jsonb,
               summary_provider = $11,
               summary_version = summary_version + 1,
               source_version = source_version + 1,
               updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [
            ownerId,
            input.itemId,
            input.extractedText,
            input.title,
            input.author,
            input.publishedAt,
            input.contentHash,
            input.summary,
            JSON.stringify(input.takeaways),
            JSON.stringify(input.suggestedTopics),
            input.provider,
          ],
        );
        await tx.query(`DELETE FROM item_chunks WHERE owner_id = $1 AND item_id = $2`, [ownerId, input.itemId]);
        for (const [index, chunk] of input.chunks.entries()) {
          await tx.query(
            `INSERT INTO item_chunks (owner_id, item_id, ordinal, text, embedding)
             VALUES ($1, $2, $3, $4, $5::vector)`,
            [ownerId, input.itemId, index, chunk.text, vectorLiteral(chunk.embedding)],
          );
        }
        await tx.query(
          `UPDATE processing_jobs
           SET status = 'succeeded', leased_until = NULL, last_error = NULL, updated_at = now()
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, input.jobId],
        );
        await tx.query(
          `UPDATE project_briefs
           SET stale = true
           WHERE owner_id = $1
             AND project_id IN (SELECT project_id FROM item_projects WHERE item_id = $2 AND owner_id = $1)`,
          [ownerId, input.itemId],
        );
      });
    },

    async retry(itemId: string) {
      return withOwner(async (tx) => {
        const active = await tx.query(
          `SELECT id FROM processing_jobs
           WHERE owner_id = $1 AND item_id = $2 AND status = 'leased' AND leased_until > now()`,
          [ownerId, itemId],
        );
        if (active.length > 0) throw new StoreError("This item is already processing.", "conflict");
        const updated = await tx.query(
          `UPDATE processing_jobs
           SET status = 'queued', attempts = 0, leased_until = NULL, last_error = NULL, updated_at = now()
           WHERE owner_id = $1 AND item_id = $2
           RETURNING id`,
          [ownerId, itemId],
        );
        if (updated.length === 0) {
          await tx.query(`INSERT INTO processing_jobs (owner_id, item_id, status) VALUES ($1, $2, 'queued')`, [
            ownerId,
            itemId,
          ]);
        }
        await tx.query(
          `UPDATE saved_items SET status = 'captured', safe_error = NULL, updated_at = now() WHERE owner_id = $1 AND id = $2`,
          [ownerId, itemId],
        );
      });
    },

    async keywordHits(query: string, filter: ItemFilter): Promise<ChunkHit[]> {
      return withOwner(async (tx) => {
        const params: unknown[] = [ownerId, query];
        const clauses = [
          "c.owner_id = $1",
          "i.owner_id = $1",
          "c.search_vector @@ websearch_to_tsquery('english', $2)",
          ...filterClauses({ ...filter, query: undefined }, true, params).filter((clause) => clause !== "i.owner_id = $1"),
        ];
        const rows = await tx.query(
          `SELECT c.id, c.item_id, c.text, c.ordinal, i.title,
                  ts_rank(c.search_vector, websearch_to_tsquery('english', $2)) AS score
           FROM item_chunks c
           JOIN saved_items i ON i.id = c.item_id
           WHERE ${clauses.join(" AND ")}
           ORDER BY score DESC
           LIMIT 20`,
          params,
        );
        return rows.map(mapHit);
      });
    },

    async semanticHits(embedding: number[], filter: ItemFilter): Promise<ChunkHit[]> {
      return withOwner(async (tx) => {
        const params: unknown[] = [ownerId, vectorLiteral(embedding)];
        const clauses = [
          "c.owner_id = $1",
          "i.owner_id = $1",
          "c.embedding IS NOT NULL",
          ...filterClauses({ ...filter, query: undefined }, true, params).filter((clause) => clause !== "i.owner_id = $1"),
        ];
        const rows = await tx.query(
          `SELECT c.id, c.item_id, c.text, c.ordinal, i.title,
                  1 - (c.embedding <=> $2::vector) AS score
           FROM item_chunks c
           JOIN saved_items i ON i.id = c.item_id
           WHERE ${clauses.join(" AND ")}
           ORDER BY c.embedding <=> $2::vector
           LIMIT 20`,
          params,
        );
        return rows.map(mapHit);
      });
    },

    async listTopics() {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM topics WHERE owner_id = $1 ORDER BY lower(name)`, [ownerId]);
        return rows.map(mapTopic);
      });
    },

    async createTopic(name: string) {
      return withOwner(async (tx) => {
        try {
          const rows = await tx.query(
            `INSERT INTO topics (owner_id, name) VALUES ($1, $2) RETURNING *`,
            [ownerId, name],
          );
          return mapTopic(rows[0]!);
        } catch (error) {
          if (!isUnique(error)) throw error;
          const rows = await tx.query(`SELECT * FROM topics WHERE owner_id = $1 AND lower(name) = lower($2)`, [
            ownerId,
            name,
          ]);
          if (!rows[0]) throw error;
          return mapTopic(rows[0]);
        }
      });
    },

    async renameTopic(id: string, name: string) {
      return withOwner(async (tx) => {
        try {
          const rows = await tx.query(
            `UPDATE topics SET name = $3 WHERE owner_id = $1 AND id = $2 RETURNING *`,
            [ownerId, id, name],
          );
          if (!rows[0]) throw new StoreError("Topic not found.", "not_found");
          return mapTopic(rows[0]);
        } catch (error) {
          if (error instanceof StoreError) throw error;
          if (isUnique(error)) throw new StoreError("A topic with that name already exists.", "conflict");
          throw error;
        }
      });
    },

    async mergeTopics(sourceId: string, targetId: string) {
      if (sourceId === targetId) throw new StoreError("Choose two different topics.", "invalid");
      await withOwner(async (tx) => {
        await tx.query(
          `INSERT INTO item_topics (item_id, topic_id, owner_id, confirmed)
           SELECT item_id, $3, owner_id, confirmed
           FROM item_topics
           WHERE owner_id = $1 AND topic_id = $2
           ON CONFLICT (item_id, topic_id)
           DO UPDATE SET confirmed = item_topics.confirmed OR EXCLUDED.confirmed`,
          [ownerId, sourceId, targetId],
        );
        await tx.query(`DELETE FROM item_topics WHERE owner_id = $1 AND topic_id = $2`, [ownerId, sourceId]);
        const deleted = await tx.query(`DELETE FROM topics WHERE owner_id = $1 AND id = $2 RETURNING id`, [
          ownerId,
          sourceId,
        ]);
        if (deleted.length === 0) throw new StoreError("Topic not found.", "not_found");
      });
    },

    async deleteTopic(id: string) {
      await withOwner(async (tx) => {
        await tx.query(`DELETE FROM topics WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
      });
    },

    async acceptSuggestion(itemId: string, name: string) {
      return withOwner(async (tx) => {
        let rows = await tx.query(`SELECT * FROM topics WHERE owner_id = $1 AND lower(name) = lower($2)`, [
          ownerId,
          name,
        ]);
        if (!rows[0]) {
          rows = await tx.query(`INSERT INTO topics (owner_id, name) VALUES ($1, $2) RETURNING *`, [ownerId, name]);
        }
        const topic = mapTopic(rows[0]!);
        await tx.query(
          `INSERT INTO item_topics (item_id, topic_id, owner_id, confirmed)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (item_id, topic_id) DO UPDATE SET confirmed = true`,
          [itemId, topic.id, ownerId],
        );
        return topic;
      });
    },

    async listProjects(status?: ProjectStatus) {
      return withOwner(async (tx) => {
        const rows = status
          ? await tx.query(`SELECT * FROM projects WHERE owner_id = $1 AND status = $2 ORDER BY lower(name)`, [
              ownerId,
              status,
            ])
          : await tx.query(`SELECT * FROM projects WHERE owner_id = $1 ORDER BY lower(name)`, [ownerId]);
        return rows.map(mapProject);
      });
    },

    async getProject(id: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM projects WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
        return rows[0] ? mapProject(rows[0]) : null;
      });
    },

    async createProject(input: { name: string; description: string; researchQuestion: string }) {
      return withOwner(async (tx) => {
        try {
          const rows = await tx.query(
            `INSERT INTO projects (owner_id, name, description, research_question, status)
             VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
            [ownerId, input.name, input.description, input.researchQuestion],
          );
          return mapProject(rows[0]!);
        } catch (error) {
          if (isUnique(error)) throw new StoreError("A project with that name already exists.", "conflict");
          throw error;
        }
      });
    },

    async updateProject(
      id: string,
      patch: { name?: string; description?: string; researchQuestion?: string; status?: ProjectStatus },
    ) {
      return withOwner(async (tx) => {
        try {
          const rows = await tx.query(
            `UPDATE projects
             SET name = COALESCE($3, name),
                 description = COALESCE($4, description),
                 research_question = COALESCE($5, research_question),
                 status = COALESCE($6, status),
                 updated_at = now()
             WHERE owner_id = $1 AND id = $2
             RETURNING *`,
            [ownerId, id, patch.name ?? null, patch.description ?? null, patch.researchQuestion ?? null, patch.status ?? null],
          );
          if (!rows[0]) throw new StoreError("Project not found.", "not_found");
          return mapProject(rows[0]);
        } catch (error) {
          if (error instanceof StoreError) throw error;
          if (isUnique(error)) throw new StoreError("A project with that name already exists.", "conflict");
          throw error;
        }
      });
    },

    async getBrief(projectId: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM project_briefs WHERE owner_id = $1 AND project_id = $2`, [
          ownerId,
          projectId,
        ]);
        return rows[0] ? mapBrief(rows[0]) : null;
      });
    },

    async saveBrief(input: {
      projectId: string;
      body: string;
      citations: { itemId: string }[];
      provider: string;
    }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO project_briefs (project_id, owner_id, body, citations, refreshed_at, stale, provider)
           VALUES ($1, $2, $3, $4::jsonb, now(), false, $5)
           ON CONFLICT (project_id) DO UPDATE
           SET body = EXCLUDED.body,
               citations = EXCLUDED.citations,
               refreshed_at = now(),
               stale = false,
               provider = EXCLUDED.provider
           RETURNING *`,
          [input.projectId, ownerId, input.body, JSON.stringify(input.citations), input.provider],
        );
        const brief = mapBrief(rows[0]!);
        await replaceDependencies(tx, ownerId, "project_brief", brief.id, input.citations.map((citation) => citation.itemId));
        return brief;
      });
    },

    async createSession(title: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO chat_sessions (owner_id, title) VALUES ($1, $2) RETURNING *`,
          [ownerId, title.slice(0, 120)],
        );
        return mapSession(rows[0]!);
      });
    },

    async listSessions() {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM chat_sessions WHERE owner_id = $1 ORDER BY created_at DESC`, [
          ownerId,
        ]);
        return rows.map(mapSession);
      });
    },

    async getSession(id: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM chat_sessions WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
        return rows[0] ? mapSession(rows[0]) : null;
      });
    },

    async addMessage(input: {
      sessionId: string;
      role: "user" | "assistant";
      body: string;
      citations?: { chunkId: string; itemId: string }[];
      inferred?: string[];
      applications?: string[];
      insufficient?: boolean;
      provider?: string | null;
    }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO chat_messages (
             session_id, owner_id, role, body, citations, inferred, applications, insufficient, provider
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
           RETURNING *`,
          [
            input.sessionId,
            ownerId,
            input.role,
            input.body,
            JSON.stringify(input.citations ?? []),
            JSON.stringify(input.inferred ?? []),
            JSON.stringify(input.applications ?? []),
            input.insufficient ?? false,
            input.provider ?? null,
          ],
        );
        const message = mapMessage(rows[0]!);
        if (input.role === "assistant") {
          await replaceDependencies(
            tx,
            ownerId,
            "chat_message",
            message.id,
            (input.citations ?? []).map((citation) => citation.itemId),
          );
        }
        return message;
      });
    },

    async listMessages(sessionId: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `SELECT * FROM chat_messages WHERE owner_id = $1 AND session_id = $2 ORDER BY created_at, id`,
          [ownerId, sessionId],
        );
        return rows.map(mapMessage);
      });
    },

    async createDigest(input: {
      rangeStart: string;
      rangeEnd: string;
      projectId: string | null;
      topicId: string | null;
      body: DigestBody;
      provider: string | null;
      itemIds: string[];
    }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO digests (owner_id, range_start, range_end, project_id, topic_id, body, provider)
           VALUES ($1, $2::date, $3::date, $4, $5, $6::jsonb, $7)
           RETURNING *`,
          [
            ownerId,
            input.rangeStart,
            input.rangeEnd,
            input.projectId,
            input.topicId,
            JSON.stringify(input.body),
            input.provider,
          ],
        );
        const digest = mapDigest(rows[0]!);
        await replaceDependencies(tx, ownerId, "digest", digest.id, input.itemIds);
        return digest;
      });
    },

    async listDigests() {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM digests WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
        return rows.map(mapDigest);
      });
    },

    async getDigest(id: string) {
      return withOwner(async (tx) => {
        const rows = await tx.query(`SELECT * FROM digests WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
        return rows[0] ? mapDigest(rows[0]) : null;
      });
    },

    async deleteItem(id: string) {
      await withOwner(async (tx) => {
        await redactItem(tx, ownerId, id);
        await tx.query(`DELETE FROM saved_items WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
      });
    },

    async deleteAll() {
      await withOwner(async (tx) => {
        await tx.query(
          `UPDATE chat_messages
           SET body = $2, citations = '[]'::jsonb, inferred = '[]'::jsonb, applications = '[]'::jsonb, invalidated = true
           WHERE owner_id = $1`,
          [ownerId, REDACTED],
        );
        await tx.query(`UPDATE digests SET body = $2::jsonb, invalidated = true WHERE owner_id = $1`, [
          ownerId,
          JSON.stringify(REDACTED_DIGEST),
        ]);
        await tx.query(`DELETE FROM project_briefs WHERE owner_id = $1`, [ownerId]);
        await tx.query(`DELETE FROM source_dependencies WHERE owner_id = $1`, [ownerId]);
        await tx.query(`DELETE FROM saved_items WHERE owner_id = $1`, [ownerId]);
        await tx.query(`DELETE FROM topics WHERE owner_id = $1`, [ownerId]);
        await tx.query(`DELETE FROM projects WHERE owner_id = $1`, [ownerId]);
        await tx.query(`DELETE FROM ai_usage WHERE owner_id = $1`, [ownerId]);
      });
    },

    async exportData() {
      return withOwner(async (tx) => {
        const items = await tx.query(
          `SELECT id, source_url, original_input, user_pasted_text, extracted_text, title, author, published_at, user_note, created_at
           FROM saved_items WHERE owner_id = $1 ORDER BY created_at`,
          [ownerId],
        );
        const topics = await tx.query(`SELECT id, name FROM topics WHERE owner_id = $1 ORDER BY lower(name)`, [ownerId]);
        const projects = await tx.query(
          `SELECT id, name, description, research_question, status FROM projects WHERE owner_id = $1 ORDER BY lower(name)`,
          [ownerId],
        );
        const itemTopics = await tx.query(
          `SELECT item_id, topic_id FROM item_topics WHERE owner_id = $1 AND confirmed = true`,
          [ownerId],
        );
        const itemProjects = await tx.query(`SELECT item_id, project_id FROM item_projects WHERE owner_id = $1`, [
          ownerId,
        ]);
        return {
          exportedAt: new Date().toISOString(),
          items: items.map((item) => ({
            id: String(item.id),
            sourceUrl: text(item.source_url),
            originalInput: asObject(item.original_input, {}),
            pastedText: text(item.user_pasted_text),
            extractedText: text(item.extracted_text),
            title: text(item.title),
            author: text(item.author),
            publishedAt: isoDate(item.published_at as string | null),
            note: text(item.user_note),
            savedAt: isoDate(item.created_at as string),
          })),
          topics: topics.map((topic) => ({ id: String(topic.id), name: String(topic.name) })),
          projects: projects.map((project) => ({
            id: String(project.id),
            name: String(project.name),
            description: String(project.description ?? ""),
            researchQuestion: String(project.research_question ?? ""),
            status: String(project.status),
          })),
          itemTopics: itemTopics.map((row) => ({ itemId: String(row.item_id), topicId: String(row.topic_id) })),
          itemProjects: itemProjects.map((row) => ({ itemId: String(row.item_id), projectId: String(row.project_id) })),
        };
      });
    },

    async stats(): Promise<LibraryStats> {
      return withOwner(async (tx) => {
        const items = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM saved_items WHERE owner_id = $1`, [
          ownerId,
        ]);
        const jobs = await tx.query<{ status: string; count: string }>(
          `SELECT status, count(*)::text AS count FROM processing_jobs WHERE owner_id = $1 GROUP BY status`,
          [ownerId],
        );
        const usage = await tx.query(
          `SELECT * FROM ai_usage WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [ownerId],
        );
        return {
          items: Number(items[0]?.count ?? 0),
          jobs: Object.fromEntries(jobs.map((row) => [row.status, Number(row.count)])),
          usage: usage.map(mapUsage),
        };
      });
    },

    async recordUsage(input: {
      kind: string;
      provider: string;
      model?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
    }) {
      if (input.inputTokens == null && input.outputTokens == null) return;
      await withOwner(async (tx) => {
        await tx.query(
          `INSERT INTO ai_usage (owner_id, kind, provider, model, input_tokens, output_tokens)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ownerId, input.kind, input.provider, input.model ?? null, input.inputTokens ?? null, input.outputTokens ?? null],
        );
      });
    },

    async itemsForBrief(projectId: string) {
      return this.listItems({ projectId, status: "ready", limit: 50 });
    },

    async itemsInRange(filter: { from: string; to: string; projectId?: string; topicId?: string }) {
      return this.listItems({ ...filter, status: "ready", sort: "newest", limit: 100 });
    },

    async saveReadyItem(input: {
      id?: string;
      title: string;
      text: string;
      summary: string;
      takeaways: string[];
      sourceUrl?: string | null;
      urlKey?: string | null;
      note?: string | null;
      topicNames?: string[];
      projectIds?: string[];
      embedding: (text: string) => number[];
      createdAt?: string;
    }) {
      return withOwner(async (tx) => {
        const rows = await tx.query(
          `INSERT INTO saved_items (
             id, owner_id, source_url, url_key, content_hash, original_input, user_pasted_text, title, user_note,
             status, ai_summary, ai_takeaways, summary_provider, summary_version, created_at, updated_at
           ) VALUES (
             COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7, $8, $9,
             'ready', $10, $11::jsonb, 'mock', 1, COALESCE($12::timestamptz, now()), COALESCE($12::timestamptz, now())
           ) RETURNING *`,
          [
            input.id ?? null,
            ownerId,
            input.sourceUrl ?? null,
            input.urlKey ?? null,
            contentHashOf(input.text),
            JSON.stringify({ text: input.text, url: input.sourceUrl ?? "", title: input.title, note: input.note ?? "" }),
            input.text,
            input.title,
            input.note ?? null,
            input.summary,
            JSON.stringify(input.takeaways),
            input.createdAt ?? null,
          ],
        );
        const itemId = String(rows[0]?.id);
        const chunks = chunkForSeed(input.text);
        for (const [index, chunk] of chunks.entries()) {
          await tx.query(
            `INSERT INTO item_chunks (owner_id, item_id, ordinal, text, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
            [ownerId, itemId, index, chunk, vectorLiteral(input.embedding(chunk))],
          );
        }
        for (const name of input.topicNames ?? []) {
          const topicRows = await tx.query(
            `INSERT INTO topics (owner_id, name) VALUES ($1, $2)
             ON CONFLICT (owner_id, name_key) DO NOTHING
             RETURNING id`,
            [ownerId, name],
          );
          const topicId =
            topicRows[0]?.id ??
            (
              await tx.query(`SELECT id FROM topics WHERE owner_id = $1 AND lower(name) = lower($2)`, [ownerId, name])
            )[0]?.id;
          if (topicId) {
            await tx.query(
              `INSERT INTO item_topics (item_id, topic_id, owner_id, confirmed) VALUES ($1, $2, $3, true)
               ON CONFLICT DO NOTHING`,
              [itemId, topicId, ownerId],
            );
          }
        }
        for (const projectId of input.projectIds ?? []) {
          await tx.query(
            `INSERT INTO item_projects (item_id, project_id, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [itemId, projectId, ownerId],
          );
        }
        const [item] = await hydrate(tx, rows);
        return item!;
      });
    },
  };
}

function contentHashOf(value: string) {
  return createHash("sha256").update(value.replace(/\s+/g, " ").trim()).digest("hex");
}

function chunkForSeed(text: string) {
  const trimmed = text.trim();
  return trimmed.length <= 800 ? [trimmed] : [trimmed.slice(0, 800)];
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;

function mapHit(row: SqlRow): ChunkHit {
  return {
    chunkId: String(row.id),
    itemId: String(row.item_id),
    title: text(row.title),
    text: String(row.text),
    ordinal: Number(row.ordinal),
    score: Number(row.score ?? 0),
  };
}

function mapTopic(row: SqlRow): Topic {
  return { id: String(row.id), name: String(row.name), createdAt: isoDate(row.created_at as string) ?? "" };
}

function mapProject(row: SqlRow): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    researchQuestion: String(row.research_question ?? ""),
    status: row.status as ProjectStatus,
    createdAt: isoDate(row.created_at as string) ?? "",
    updatedAt: isoDate(row.updated_at as string) ?? "",
  };
}

function mapBrief(row: SqlRow): ProjectBrief {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    body: String(row.body),
    citations: asObject<{ itemId: string }[]>(row.citations, []),
    refreshedAt: isoDate(row.refreshed_at as string) ?? "",
    stale: Boolean(row.stale),
    provider: text(row.provider),
  };
}

function mapSession(row: SqlRow): ChatSession {
  return { id: String(row.id), title: String(row.title), createdAt: isoDate(row.created_at as string) ?? "" };
}

function mapMessage(row: SqlRow): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as "user" | "assistant",
    body: String(row.body),
    citations: asObject(row.citations, []),
    inferred: asObject<string[]>(row.inferred, []),
    applications: asObject<string[]>(row.applications, []),
    insufficient: Boolean(row.insufficient),
    invalidated: Boolean(row.invalidated),
    provider: text(row.provider),
    createdAt: isoDate(row.created_at as string) ?? "",
  };
}

function mapDigest(row: SqlRow): Digest {
  const rangeStart = row.range_start instanceof Date ? row.range_start.toISOString().slice(0, 10) : String(row.range_start).slice(0, 10);
  const rangeEnd = row.range_end instanceof Date ? row.range_end.toISOString().slice(0, 10) : String(row.range_end).slice(0, 10);
  return {
    id: String(row.id),
    rangeStart,
    rangeEnd,
    projectId: text(row.project_id),
    topicId: text(row.topic_id),
    body: asObject<DigestBody>(row.body, REDACTED_DIGEST),
    invalidated: Boolean(row.invalidated),
    provider: text(row.provider),
    createdAt: isoDate(row.created_at as string) ?? "",
  };
}

function mapUsage(row: SqlRow): UsageRow {
  return {
    kind: String(row.kind),
    provider: String(row.provider),
    model: text(row.model),
    inputTokens: row.input_tokens == null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens == null ? null : Number(row.output_tokens),
    createdAt: isoDate(row.created_at as string) ?? "",
  };
}

async function replaceDependencies(tx: Sql, ownerId: string, outputType: string, outputId: string, itemIds: string[]) {
  await tx.query(`DELETE FROM source_dependencies WHERE owner_id = $1 AND output_type = $2 AND output_id = $3`, [
    ownerId,
    outputType,
    outputId,
  ]);
  const unique = [...new Set(itemIds)];
  for (const itemId of unique) {
    await tx.query(
      `INSERT INTO source_dependencies (owner_id, item_id, output_type, output_id) VALUES ($1, $2, $3, $4)`,
      [ownerId, itemId, outputType, outputId],
    );
  }
}

async function redactItem(tx: Sql, ownerId: string, itemId: string) {
  const deps = await tx.query(
    `SELECT output_type, output_id FROM source_dependencies WHERE owner_id = $1 AND item_id = $2`,
    [ownerId, itemId],
  );
  const messages = deps.filter((row) => row.output_type === "chat_message").map((row) => String(row.output_id));
  const digests = deps.filter((row) => row.output_type === "digest").map((row) => String(row.output_id));
  const briefs = deps.filter((row) => row.output_type === "project_brief").map((row) => String(row.output_id));
  if (messages.length > 0) {
    await tx.query(
      `UPDATE chat_messages
       SET body = $2, citations = '[]'::jsonb, inferred = '[]'::jsonb, applications = '[]'::jsonb, invalidated = true
       WHERE owner_id = $1 AND id IN (${messages.map((_, index) => `$${index + 3}`).join(", ")})`,
      [ownerId, REDACTED, ...messages],
    );
  }
  if (digests.length > 0) {
    await tx.query(
      `UPDATE digests
       SET body = $2::jsonb, invalidated = true
       WHERE owner_id = $1 AND id IN (${digests.map((_, index) => `$${index + 3}`).join(", ")})`,
      [ownerId, JSON.stringify(REDACTED_DIGEST), ...digests],
    );
  }
  if (briefs.length > 0) {
    await tx.query(
      `UPDATE project_briefs
       SET body = $2, citations = '[]'::jsonb, stale = true
       WHERE owner_id = $1 AND id IN (${briefs.map((_, index) => `$${index + 3}`).join(", ")})`,
      [ownerId, REDACTED, ...briefs],
    );
  }
  await tx.query(`DELETE FROM source_dependencies WHERE owner_id = $1 AND item_id = $2`, [ownerId, itemId]);
}

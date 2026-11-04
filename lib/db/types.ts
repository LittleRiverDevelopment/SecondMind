export type ItemStatus = "captured" | "processing" | "ready" | "needs_content" | "failed";
export type ProjectStatus = "active" | "archived";
export type OutputType = "chat_message" | "digest" | "project_brief";

export type TopicRef = { id: string; name: string; confirmed: boolean };
export type ProjectRef = { id: string; name: string };

export type SuggestedTopic = { name: string; reason: string };

export type SavedItem = {
  id: string;
  ownerId: string;
  sourceUrl: string | null;
  originalInput: { url?: string; text?: string; title?: string; note?: string };
  userPastedText: string | null;
  extractedText: string | null;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  userNote: string | null;
  status: ItemStatus;
  safeError: string | null;
  aiSummary: string | null;
  aiTakeaways: string[];
  suggestedTopics: SuggestedTopic[];
  summaryProvider: string | null;
  summaryVersion: number;
  sourceVersion: number;
  createdAt: string;
  updatedAt: string;
  topics: TopicRef[];
  projects: ProjectRef[];
};

export type ItemFilter = {
  query?: string;
  topicId?: string;
  projectId?: string;
  status?: ItemStatus | "";
  from?: string;
  to?: string;
  sort?: "newest" | "oldest";
  limit?: number;
};

export type ChunkHit = {
  chunkId: string;
  itemId: string;
  title: string | null;
  text: string;
  ordinal: number;
  score: number;
};

export type Topic = { id: string; name: string; createdAt: string };
export type Project = {
  id: string;
  name: string;
  description: string;
  researchQuestion: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type Citation = { chunkId: string; itemId: string };

export type ChatSession = { id: string; title: string; createdAt: string };
export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  body: string;
  citations: Citation[];
  inferred: string[];
  applications: string[];
  insufficient: boolean;
  invalidated: boolean;
  provider: string | null;
  createdAt: string;
};

export type DigestSection = { text: string; itemIds: string[] };
export type DigestBody = {
  themes: DigestSection[];
  takeaways: DigestSection[];
  connections: DigestSection[];
  applications: { text: string; itemIds: string[]; projectId: string | null }[];
  gaps: string[];
  empty: boolean;
};

export type Digest = {
  id: string;
  rangeStart: string;
  rangeEnd: string;
  projectId: string | null;
  topicId: string | null;
  body: DigestBody;
  invalidated: boolean;
  provider: string | null;
  createdAt: string;
};

export type ProjectBrief = {
  id: string;
  projectId: string;
  body: string;
  citations: { itemId: string }[];
  refreshedAt: string;
  stale: boolean;
  provider: string | null;
};

export type ProcessingJob = {
  id: string;
  itemId: string;
  status: "queued" | "leased" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

export type UsageRow = {
  kind: string;
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};

export type LibraryStats = {
  items: number;
  jobs: Record<string, number>;
  usage: UsageRow[];
};

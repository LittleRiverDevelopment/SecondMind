"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { loadConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/auth/owner";
import { issueSession, passwordsMatch } from "@/lib/auth/session";
import { readOwnerSession } from "@/lib/auth/owner";
import { getStore } from "@/lib/db";
import { StoreError } from "@/lib/db/store";
import { assessUrl } from "@/lib/extraction/ssrf";
import { consumeRateLimit } from "@/lib/rate-limit";
import { contentHash, exactUrlKey, parseTopicList } from "@/lib/text";
import { captureSchema, formString, questionSchema } from "@/lib/validation";
import { createProvider } from "@/lib/ai/provider";
import { answerQuestion } from "@/lib/chat/answer";
import { buildDigest } from "@/lib/digest/generate";
import { refreshBrief } from "@/lib/projects/brief";

export type CaptureState = { error?: string | null; duplicateId?: string; duplicateTitle?: string | null };

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 14,
};

function messageOf(error: unknown) {
  if (error instanceof StoreError) return error.message;
  if (error instanceof Error && error.message && !error.message.includes("\n")) return error.message;
  return "That could not be saved.";
}

function bounce(path: string, error: string): never {
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}error=${encodeURIComponent(error)}`);
}

export async function login(_prev: { error?: string }, formData: FormData) {
  const config = loadConfig();
  if (!config.ok) return { error: config.reason };
  const cookieStore = await cookies();
  if (config.mode === "demo") {
    cookieStore.set(
      SESSION_COOKIE,
      issueSession({ sub: config.ownerId, email: config.ownerEmail, mode: "demo" }, config.sessionSecret),
      cookieOptions,
    );
    redirect("/");
  }
  if (config.mode === "local") {
    const email = formString(formData, "email").toLowerCase();
    const password = formString(formData, "password");
    if (email !== config.ownerEmail || !config.ownerPassword || !passwordsMatch(password, config.ownerPassword)) {
      return { error: "Those owner credentials were not accepted." };
    }
    cookieStore.set(
      SESSION_COOKIE,
      issueSession({ sub: config.ownerId, email: config.ownerEmail, mode: "local" }, config.sessionSecret),
      cookieOptions,
    );
    redirect("/");
  }
  const supabase = createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const cookie of cookiesToSet) cookieStore.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || data.user?.email?.toLowerCase() !== config.ownerEmail || data.user.id !== config.ownerId) {
    await supabase.auth.signOut();
    return { error: "This account is not the configured owner." };
  }
  redirect("/");
}

export async function logout() {
  const config = loadConfig();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  if (config.ok && config.mode === "supabase") {
    const supabase = createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const cookie of cookiesToSet) cookieStore.set(cookie.name, cookie.value, cookie.options);
        },
      },
    });
    await supabase.auth.signOut();
  }
  redirect("/login");
}

async function ownerContext() {
  const auth = await readOwnerSession();
  if (!auth.ok) return auth;
  const store = await getStore();
  return { ...auth, store };
}

export async function capture(_prev: CaptureState, formData: FormData): Promise<CaptureState> {
  const auth = await ownerContext();
  if (!auth.ok) return { error: auth.reason };
  const limit = consumeRateLimit(`${auth.session.id}:capture`, auth.config.captureLimitPerHour);
  if (!limit.ok) return { error: "Too many saves this hour. Wait and try again." };
  const parsed = captureSchema.safeParse({
    url: formString(formData, "url"),
    text: formString(formData, "text"),
    title: formString(formData, "title"),
    note: formString(formData, "note"),
    topics: formString(formData, "topics"),
    projectId: formString(formData, "projectId"),
    force: formString(formData, "force"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.url) {
    const assessed = await assessUrl(parsed.data.url);
    if (!assessed.ok) return { error: assessed.message };
  }
  const urlKey = exactUrlKey(parsed.data.url);
  const hash = contentHash(parsed.data.text);
  if (parsed.data.force !== "yes") {
    const existing = await auth.store.findDuplicate(urlKey, hash);
    if (existing) return { duplicateId: existing.id, duplicateTitle: existing.title };
  }
  const topicIds: string[] = [];
  for (const name of parseTopicList(parsed.data.topics)) {
    const topic = await auth.store.createTopic(name);
    topicIds.push(topic.id);
  }
  const item = await auth.store.createItem({
    sourceUrl: urlKey,
    urlKey,
    contentHash: hash,
    originalInput: {
      url: parsed.data.url,
      text: parsed.data.text,
      title: parsed.data.title,
      note: parsed.data.note,
    },
    userPastedText: parsed.data.text || null,
    title: parsed.data.title || null,
    userNote: parsed.data.note || null,
    topicIds,
    projectId: parsed.data.projectId || null,
  });
  revalidatePath("/");
  redirect(`/items/${item.id}`);
}

export async function updateNote(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  const note = formString(formData, "note").slice(0, 5000);
  const title = formString(formData, "title").slice(0, 300);
  try {
    await auth.store.updateItemMeta(id, { title, userNote: note });
  } catch (error) {
    bounce(`/items/${id}`, messageOf(error));
  }
  revalidatePath(`/items/${id}`);
}

export async function pasteContent(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  const text = formString(formData, "text").trim();
  if (text.length < 40 || text.length > 100_000) {
    bounce(`/items/${id}`, "Paste at least a short paragraph, under 100,000 characters.");
  }
  const hash = contentHash(text);
  if (hash) {
    const existing = await auth.store.findDuplicate(null, hash);
    if (existing && existing.id !== id) bounce(`/items/${existing.id}`, "That text is already saved.");
  }
  await auth.store.addPastedText(id, text, hash ?? "");
  revalidatePath(`/items/${id}`);
  redirect(`/items/${id}`);
}

export async function assignProjects(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  const projectIds = formData.getAll("projectId").filter((value): value is string => typeof value === "string");
  await auth.store.setItemProjects(id, projectIds);
  revalidatePath(`/items/${id}`);
}

export async function acceptTopic(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  const name = formString(formData, "name").slice(0, 80);
  if (!name) bounce(`/items/${id}`, "Missing topic.");
  await auth.store.acceptSuggestion(id, name);
  revalidatePath(`/items/${id}`);
}

export async function retryItem(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  try {
    await auth.store.retry(id);
  } catch (error) {
    bounce(`/items/${id}`, messageOf(error));
  }
  revalidatePath(`/items/${id}`);
}

export async function removeItem(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/items/${id}`, auth.reason);
  if (formString(formData, "confirm") !== "yes") bounce(`/items/${id}`, "Confirm deletion to continue.");
  await auth.store.deleteItem(id);
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/digests");
  redirect("/");
}

export async function ask(formData: FormData) {
  const auth = await ownerContext();
  const existing = formString(formData, "sessionId");
  const back = existing ? `/chat/${existing}` : "/chat";
  if (!auth.ok) bounce(back, auth.reason);
  const limit = consumeRateLimit(`${auth.session.id}:ai`, auth.config.aiLimitPerHour);
  if (!limit.ok) bounce(back, "Too many AI requests this hour.");
  const parsed = questionSchema.safeParse({
    question: formString(formData, "question"),
    projectId: formString(formData, "projectId"),
    topicId: formString(formData, "topicId"),
    from: formString(formData, "from"),
    to: formString(formData, "to"),
  });
  if (!parsed.success) bounce(back, parsed.error.issues[0]?.message ?? "Check the question.");
  const provider = createProvider(auth.config);
  const result = await answerQuestion({
    store: auth.store,
    provider,
    question: parsed.data.question,
    filter: {
      projectId: parsed.data.projectId || undefined,
      topicId: parsed.data.topicId || undefined,
      from: parsed.data.from || undefined,
      to: parsed.data.to || undefined,
    },
    chunkLimit: auth.config.contextChunkLimit,
    charLimit: auth.config.contextCharLimit,
  });
  if (result.error) bounce(back, result.error);
  const session = existing ? await auth.store.getSession(existing) : await auth.store.createSession(parsed.data.question);
  if (!session) bounce(back, "That chat could not be found.");
  await auth.store.addMessage({ sessionId: session.id, role: "user", body: parsed.data.question });
  await auth.store.addMessage({
    sessionId: session.id,
    role: "assistant",
    body: result.validated.body,
    citations: result.validated.citations,
    inferred: result.validated.inferred,
    applications: result.validated.applications,
    insufficient: result.validated.insufficient,
    provider: result.provider,
  });
  revalidatePath(`/chat/${session.id}`);
  redirect(`/chat/${session.id}`);
}

export async function generateDigest(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/digests", auth.reason);
  const limit = consumeRateLimit(`${auth.session.id}:ai`, auth.config.aiLimitPerHour);
  if (!limit.ok) bounce("/digests", "Too many AI requests this hour.");
  const from = formString(formData, "from");
  const to = formString(formData, "to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    bounce("/digests", "Choose a start and end date.");
  }
  const projectId = formString(formData, "projectId") || null;
  const topicId = formString(formData, "topicId") || null;
  const built = await buildDigest({
    store: auth.store,
    provider: createProvider(auth.config),
    from,
    to,
    projectId: projectId ?? undefined,
    topicId: topicId ?? undefined,
  });
  if ("error" in built) bounce("/digests", built.error ?? "The digest could not be written.");
  const digest = await auth.store.createDigest({
    rangeStart: from,
    rangeEnd: to,
    projectId,
    topicId,
    body: built.body,
    provider: built.provider,
    itemIds: built.itemIds,
  });
  revalidatePath("/digests");
  redirect(`/digests/${digest.id}`);
}

export async function refreshProjectBrief(formData: FormData) {
  const auth = await ownerContext();
  const projectId = formString(formData, "projectId");
  if (!auth.ok) bounce(`/projects/${projectId}`, auth.reason);
  const limit = consumeRateLimit(`${auth.session.id}:ai`, auth.config.aiLimitPerHour);
  if (!limit.ok) bounce(`/projects/${projectId}`, "Too many AI requests this hour.");
  const result = await refreshBrief(auth.store, createProvider(auth.config), projectId);
  if ("error" in result) bounce(`/projects/${projectId}`, result.error ?? "The brief could not be refreshed.");
  revalidatePath(`/projects/${projectId}`);
}

export async function createProject(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/projects", auth.reason);
  const name = formString(formData, "name").trim();
  if (name.length < 2 || name.length > 120) bounce("/projects", "Name the project in 2 to 120 characters.");
  try {
    const project = await auth.store.createProject({
      name,
      description: formString(formData, "description").slice(0, 2000),
      researchQuestion: formString(formData, "researchQuestion").slice(0, 500),
    });
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    unstable_rethrow(error);
    bounce("/projects", messageOf(error));
  }
}

export async function updateProject(formData: FormData) {
  const auth = await ownerContext();
  const id = formString(formData, "id");
  if (!auth.ok) bounce(`/projects/${id}`, auth.reason);
  const status = formString(formData, "status");
  try {
    await auth.store.updateProject(id, {
      name: formString(formData, "name").trim(),
      description: formString(formData, "description").slice(0, 2000),
      researchQuestion: formString(formData, "researchQuestion").slice(0, 500),
      status: status === "archived" ? "archived" : "active",
    });
  } catch (error) {
    bounce(`/projects/${id}`, messageOf(error));
  }
  revalidatePath(`/projects/${id}`);
}

export async function createTopicAction(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/topics", auth.reason);
  const name = formString(formData, "name").trim();
  if (!name || name.length > 80) bounce("/topics", "Topic names need 1 to 80 characters.");
  await auth.store.createTopic(name);
  revalidatePath("/topics");
}

export async function renameTopicAction(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/topics", auth.reason);
  try {
    await auth.store.renameTopic(formString(formData, "id"), formString(formData, "name").trim());
  } catch (error) {
    bounce("/topics", messageOf(error));
  }
  revalidatePath("/topics");
}

export async function mergeTopicAction(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/topics", auth.reason);
  try {
    await auth.store.mergeTopics(formString(formData, "sourceId"), formString(formData, "targetId"));
  } catch (error) {
    bounce("/topics", messageOf(error));
  }
  revalidatePath("/topics");
}

export async function deleteTopicAction(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/topics", auth.reason);
  await auth.store.deleteTopic(formString(formData, "id"));
  revalidatePath("/topics");
}

export async function deleteEverything(formData: FormData) {
  const auth = await ownerContext();
  if (!auth.ok) bounce("/settings", auth.reason);
  if (formString(formData, "confirm") !== "DELETE") bounce("/settings", "Type DELETE to confirm.");
  await auth.store.deleteAll();
  revalidatePath("/");
  redirect("/settings");
}

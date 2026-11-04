import { z } from "zod";
import { parseTopicList } from "@/lib/text";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const captureSchema = z
  .object({
    url: optionalText(2000),
    text: optionalText(100_000),
    title: optionalText(300),
    note: optionalText(5000),
    topics: optionalText(500),
    projectId: z.string().trim().optional().default(""),
    force: z.string().optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (!value.url && !value.text) {
      ctx.addIssue({ code: "custom", message: "Add a URL or some text.", path: ["text"] });
    }
    if (value.url) {
      try {
        const url = new URL(value.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          ctx.addIssue({ code: "custom", message: "Use an http or https URL.", path: ["url"] });
        }
      } catch {
        ctx.addIssue({ code: "custom", message: "That URL is not valid.", path: ["url"] });
      }
    }
    if (value.projectId && !z.uuid().safeParse(value.projectId).success) {
      ctx.addIssue({ code: "custom", message: "Choose a project from the list.", path: ["projectId"] });
    }
    if (parseTopicList(value.topics).some((topic) => topic.length > 80)) {
      ctx.addIssue({ code: "custom", message: "Topic names need to be 80 characters or fewer.", path: ["topics"] });
    }
  });

export const questionSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  projectId: z.string().trim().optional().default(""),
  topicId: z.string().trim().optional().default(""),
  from: z.string().trim().optional().default(""),
  to: z.string().trim().optional().default(""),
});

export function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

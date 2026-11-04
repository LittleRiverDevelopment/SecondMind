import { expect, test } from "@playwright/test";

const marker = `ALPHA-${Date.now()}`;
const note = `Playwright retention note ${marker} about checklist renewals. Users who completed a checklist renewed more often in this synthetic note.`;

test("save, organize, ask, digest, and delete", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-demo").click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText("Demo mode")).toBeVisible();

  await page.getByTestId("capture-title").fill(`Note ${marker}`);
  await page.getByTestId("capture-text").fill(note);
  await page.getByTestId("capture-note").fill("Because the checklist idea matters");
  await page.getByTestId("capture-submit").click();
  await page.waitForURL(/\/items\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByTestId("item-status")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });

  await page.getByTestId("note-input").fill("Edited note for the checklist idea");
  await page.getByTestId("note-save").click();
  await expect(page.getByTestId("note-input")).toHaveValue("Edited note for the checklist idea");

  const project = page.getByTestId("project-assign").first();
  await project.check();
  await page.getByTestId("project-save").click();
  await expect(project).toBeChecked();

  await page.goto("/chat");
  await page.getByTestId("chat-question").fill(`What did I save about checklist renewals? ${marker}`);
  await page.getByTestId("chat-submit").click();
  await expect(page.getByTestId("chat-answer")).toContainText(/checklist/i);
  await expect(page.getByTestId("citation-link").first()).toBeVisible();
  const chatUrl = page.url();

  await page.goto("/digests");
  await page.getByTestId("digest-generate").click();
  await expect(page.getByTestId("digest-body")).toContainText(marker);
  const digestUrl = page.url();

  await page.getByTestId("digest-citation").first().click();
  await page.getByTestId("delete-confirm").check();
  await page.getByTestId("delete-item").click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText(marker)).toHaveCount(0);

  await page.goto(chatUrl);
  await expect(page.getByTestId("chat-answer")).not.toContainText(marker);
  await page.goto(digestUrl);
  await expect(page.getByTestId("digest-body")).not.toContainText(marker);
});

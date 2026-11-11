import { expect, type Page } from "@playwright/test";

export const SEED_PASSWORD = "shotlyst-demo-1";
export const OWNER_EMAIL = "owner@shotlyst.test";
// A seed project the invited user in these tests is never added to.
export const SEED_PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SEED_PROJECT_NAME = "Harbour Spot";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Waits for the newest email to an address in the local mail catcher and
// returns the first link in it.
export async function linkFromEmail(to: string): Promise<string> {
  let html = "";
  await expect(async () => {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    expect(messages.length).toBeGreaterThan(0);
    const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
    html = ((await message.json()) as { HTML: string }).HTML;
  }).toPass({ timeout: 15_000 });

  const match = /href="([^"]+)"/.exec(html);
  if (!match) throw new Error(`No link in the email to ${to}`);
  return match[1].replaceAll("&amp;", "&");
}

// A 1x1 PNG.
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

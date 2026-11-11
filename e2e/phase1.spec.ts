import { expect, test } from "@playwright/test";

import {
  linkFromEmail,
  OWNER_EMAIL,
  PNG,
  SEED_PASSWORD,
  SEED_PROJECT_ID,
  SEED_PROJECT_NAME,
  signIn,
} from "./helpers";

const run = Date.now();
const projectName = `E2E Film ${run}`;
const inviteeEmail = `invitee-${run}@shotlyst.test`;
const inviteePassword = "a-long-test-password";
const fileName = "e2e-still.png";

test.describe.configure({ mode: "serial" });

test("every route redirects to /login without a session", async ({ page }) => {
  for (const path of ["/", "/projects", `/projects/${SEED_PROJECT_ID}/files`, "/library/brands", "/settings/members"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  }
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("pages are kept out of search indexes", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});

test("a wrong password is rejected", async ({ browser }) => {
  // Its own client address, so repeated runs do not trip the sign-in throttle
  // for the other tests.
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${run % 250}` },
  });
  const page = await context.newPage();
  await signIn(page, OWNER_EMAIL, "not-the-password");
  await expect(page.getByText("Email or password is wrong.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test("the cron endpoint needs its secret", async ({ request }) => {
  expect((await request.get("/api/cron/keepalive")).status()).toBe(401);
});

let projectUrl = "";

test("the owner creates a project, uploads a file and previews it", async ({ page }) => {
  await signIn(page, OWNER_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/:3000\/$/);

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill(projectName);
  await expect(page.getByLabel("Project number")).toHaveValue(/^\d{4}-\d{3}$/);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/overview$/);
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();
  projectUrl = page.url().replace(/\/overview$/, "");

  await page.getByRole("link", { name: "Files" }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: fileName, mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("1 file uploaded")).toBeVisible();

  await page.getByRole("button", { name: `Open ${fileName}` }).click();
  const image = page.getByTestId("file-preview").getByRole("img");
  await expect(image).toBeVisible();
  // The signed URL really serves the image.
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
});

test("an invited user sets a password and sees only their project", async ({ page, browser }) => {
  await signIn(page, OWNER_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/:3000\/$/);
  await page.goto(`${projectUrl}/overview`);
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a member" });
  await dialog.getByLabel("Email").fill(inviteeEmail);
  await dialog.getByLabel("Project role").selectOption("viewer");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();

  const link = await linkFromEmail(inviteeEmail);
  expect(link).toContain("/accept-invite?invitation=");

  const context = await browser.newContext();
  const invitee = await context.newPage();
  await invitee.goto(link);
  await invitee.getByLabel("Name").fill("Ivy Invitee");
  await invitee.getByLabel("New password").fill(inviteePassword);
  await invitee.getByRole("button", { name: "Join" }).click();

  await expect(invitee).toHaveURL(/:3000\/$/);
  await invitee.goto("/projects");
  await expect(invitee.getByText(projectName, { exact: true })).toBeVisible();
  await expect(invitee.getByText(SEED_PROJECT_NAME)).toHaveCount(0);

  // A project they were not added to does not exist for them.
  const response = await invitee.goto(`/projects/${SEED_PROJECT_ID}/overview`);
  expect(response?.status()).toBe(404);

  // Members without an admin role have no member settings.
  await invitee.goto("/settings/members");
  await expect(invitee).toHaveURL(/\/projects$/);

  // As a viewer they read the file library but cannot change it.
  await invitee.goto(`${projectUrl}/files`);
  await expect(invitee.getByRole("button", { name: `Open ${fileName}` })).toBeVisible();
  await expect(invitee.getByRole("button", { name: "Upload" })).toHaveCount(0);

  // The invitation link works only once.
  const second = await browser.newContext();
  const replay = await second.newPage();
  await replay.goto(link);
  await replay.getByLabel("Name").fill("Somebody Else");
  await replay.getByLabel("New password").fill(inviteePassword);
  await replay.getByRole("button", { name: "Join" }).click();
  await expect(replay.getByText(/invalid/)).toBeVisible();
  await second.close();

  // The new account signs in with its password.
  await context.clearCookies();
  await signIn(invitee, inviteeEmail, inviteePassword);
  await expect(invitee).toHaveURL(/:3000\/$/);
  await context.close();

  // The owner sees the accepted member in the directory.
  await page.goto("/settings/members");
  await expect(page.getByTestId(`member-${inviteeEmail}`)).toBeVisible();
});

test("a member resets a forgotten password through the emailed link", async ({ page }) => {
  const email = "viewer@shotlyst.test";
  const newPassword = `reset-password-${run}`;

  await page.goto("/reset-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  const link = await linkFromEmail(email);
  expect(link).toContain("/reset-password?token_hash=");
  await page.goto(link);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/:3000\/$/);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/:3000\/$/);
});

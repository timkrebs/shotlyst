import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { adminClient, createProject, PNG, SEED_PASSWORD, signIn } from "./helpers";

const run = Date.now();
const admin = adminClient();
const VIEWER_EMAIL = "viewer@shotlyst.test";

test.describe.configure({ mode: "serial" });

let page: Page;
let project: { url: string; id: string };
let projectNumber: string;
let creativeId: string;
let conceptId: string;
let secondShotId: string;

const projectName = `E2E Exports ${run}`;
const castName = `Mara Lind ${run}`;
const conceptLine = `Opening on the harbour ${run}`;

// Fails loudly when arranging data goes wrong, instead of in a later assert.
function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(result.error?.message ?? "no rows returned");
  }
  return result.data;
}

async function pdfText(response: APIResponse) {
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const document = await task.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return { pageCount: pages.length, text: pages.join(" ").replace(/\s+/g, " ") };
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  project = await createProject(page, projectName);

  projectNumber = must(
    await admin.from("projects").select("project_number").eq("id", project.id).single(),
  ).project_number;
  creativeId = must(
    await admin.from("creatives").select("id").eq("project_id", project.id).single(),
  ).id;
  const firstSegmentId = must(
    await admin.from("segments").select("id").eq("creative_id", creativeId).single(),
  ).id;

  // Two segments: the first runs over its target, the second stays within.
  must(
    await admin
      .from("segments")
      .update({ title: "Arrival", target_duration_sec: 10 })
      .eq("id", firstSegmentId)
      .select("id")
      .single(),
  );
  const secondSegmentId = must(
    await admin
      .from("segments")
      .insert({ creative_id: creativeId, title: "The pour", target_duration_sec: 60, position: "W" })
      .select("id")
      .single(),
  ).id;

  // A bulk insert sends every key for every row, so each row carries its own
  // custom values instead of falling back to the column default.
  const shotRows = [
    {
      segment_id: firstSegmentId,
      position: "a",
      action: "Boat enters the harbour",
      shot_size: "wide",
      duration_sec: 8,
      custom_values: { rig: "Gimbal" },
    },
    { segment_id: firstSegmentId, position: "b", action: "Rope is thrown ashore", duration_sec: 6 },
    { segment_id: secondSegmentId, position: "a", action: "Coffee is poured", duration_sec: 5 },
    {
      segment_id: secondSegmentId,
      position: "b",
      shot_number: "4A",
      action: "Steam rises, slowly",
      duration_sec: 7,
    },
    ...[1, 2, 3, 4].map((index) => ({
      segment_id: secondSegmentId,
      position: `c${index}`,
      action: `Cup detail ${index}`,
      duration_sec: 2,
    })),
  ];
  const shots = must(
    await admin
      .from("shots")
      .insert(shotRows.map((row) => ({ custom_values: {}, ...row })))
      .select("id, action"),
  );
  const shotId = (action: string) => shots.find((shot) => shot.action === action)?.id as string;
  secondShotId = shotId("Rope is thrown ashore");

  const talentId = must(
    await admin.from("talents").insert({ name: castName, type: "person" }).select("id").single(),
  ).id;
  must(
    await admin
      .from("shot_talents")
      .insert({ shot_id: shotId("Boat enters the harbour"), talent_id: talentId })
      .select("id")
      .single(),
  );

  // The Audio column is hidden; one custom column is added.
  must(
    await admin
      .from("shotlist_columns")
      .insert([
        { project_id: project.id, key: "audio", label: "Audio", type: "builtin", position: "a", visible: false },
        { project_id: project.id, key: "rig", label: "Rig", type: "text", position: "b", visible: true },
      ])
      .select("id"),
  );

  conceptId = must(
    await admin.from("concepts").select("id").eq("project_id", project.id).single(),
  ).id;
  must(
    await admin
      .from("concepts")
      .update({
        content: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Morning light" }] },
            {
              type: "paragraph",
              content: [
                { type: "text", text: conceptLine },
                { type: "text", text: " in bold", marks: [{ type: "bold" }] },
              ],
            },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: true },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Book the boat" }] }],
                },
              ],
            },
            { type: "filePdf", attrs: { fileId: null, path: null, name: "Brief.pdf" } },
          ],
        },
      })
      .eq("id", conceptId)
      .select("id")
      .single(),
  );
  const beats = must(
    await admin
      .from("concept_beats")
      .insert([
        { concept_id: conceptId, title: "First light", start_sec: 0, end_sec: 12, position: "a" },
        { concept_id: conceptId, title: "Steam and cup", start_sec: 12, end_sec: 25, position: "b" },
      ])
      .select("id, title"),
  );
  must(
    await admin
      .from("beat_items")
      .insert({ beat_id: beats[0].id, label: "Harbour permit", position: "a" })
      .select("id")
      .single(),
  );
});

test.afterAll(async () => {
  // Workspace settings are shared with every other test file.
  await admin.from("app_settings").delete().in("key", ["export_company", "export_logo_path"]);
  await page.close();
});

test("the shot list CSV has the visible columns in order and one row per shot", async () => {
  const response = await page.request.get(`/api/export/shotlist/${creativeId}?format=csv`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toBe(
    `attachment; filename="${projectNumber.toLowerCase()}-main-film-shot-list.csv"`,
  );

  const lines = (await response.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines).toEqual([
    "Segment,#,Action,On-screen text,Shot size,Movement,Angle,Lens,INT/EXT,Day/night,Cast,Duration (s),Status,Note,Rig",
    `Arrival,1,Boat enters the harbour,,Wide,,,,,,${castName},8,Planned,,Gimbal`,
    "Arrival,2,Rope is thrown ashore,,,,,,,,,6,Planned,,",
    "The pour,3,Coffee is poured,,,,,,,,,5,Planned,,",
    'The pour,4A,"Steam rises, slowly",,,,,,,,,7,Planned,,',
    "The pour,5,Cup detail 1,,,,,,,,,2,Planned,,",
    "The pour,6,Cup detail 2,,,,,,,,,2,Planned,,",
    "The pour,7,Cup detail 3,,,,,,,,,2,Planned,,",
    "The pour,8,Cup detail 4,,,,,,,,,2,Planned,,",
  ]);
});

test("the shot list PDF shows the visible columns, the segments and their totals", async () => {
  const response = await page.request.get(`/api/export/shotlist/${creativeId}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("-main-film-shot-list.pdf");

  const { text } = await pdfText(response);
  expect(text).toContain(`${projectName} · ${projectNumber}`);
  expect(text).toContain("Main film");
  for (const label of ["Frame", "Action", "On-screen text", "Shot size", "Cast", "Status", "Rig"]) {
    expect(text).toContain(label);
  }
  expect(text).not.toContain("Audio");
  // Not visible by default.
  expect(text).not.toContain("Setup (min)");

  expect(text).toContain("Total runtime: 0:34 of 1:10 target · 8 shots");
  expect(text).toContain("Arrival 2 shots · 0:14 of 0:10 target");
  expect(text).toContain("The pour 6 shots · 0:20 of 1:00 target");
  for (const action of ["Boat enters the harbour", "Rope is thrown ashore", "Steam rises, slowly"]) {
    expect(text).toContain(action);
  }
  expect(text).toContain(castName);
  expect(text).toContain("Gimbal");
  expect(text).toContain("4A");
  expect(text).toMatch(/Page 1 of \d+/);
  expect(text).toMatch(/Exported \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC/);
});

test("the storyboard PDF puts 6, 9 or 12 frames on a page", async () => {
  const fetchStoryboard = async (query: string) => {
    const response = await page.request.get(`/api/export/storyboard/${creativeId}${query}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toContain("-main-film-storyboard.pdf");
    return pdfText(response);
  };

  // Eight shots: two pages of six, one page of nine or twelve.
  const six = await fetchStoryboard("");
  expect(six.pageCount).toBe(2);
  expect(six.text).toContain("1 · Wide · 0:08");
  expect(six.text).toContain("4A · 0:07");
  expect(six.text).toContain("Cup detail 4");
  expect(six.text).toContain("No frame");

  expect((await fetchStoryboard("?perPage=6")).pageCount).toBe(2);
  expect((await fetchStoryboard("?perPage=9")).pageCount).toBe(1);
  expect((await fetchStoryboard("?perPage=12")).pageCount).toBe(1);
  // Anything else falls back to six.
  expect((await fetchStoryboard("?perPage=500")).pageCount).toBe(2);
});

test("the concept PDF contains the text and the beats", async () => {
  const response = await page.request.get(`/api/export/concept/${conceptId}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("-treatment-concept.pdf");

  const { text } = await pdfText(response);
  expect(text).toContain("Treatment");
  expect(text).toContain("Morning light");
  expect(text).toContain(conceptLine);
  expect(text).toContain("in bold");
  expect(text).toContain("Book the boat");
  expect(text).toContain("Attached PDF: Brief.pdf");
  expect(text).toContain("Beats");
  expect(text).toContain("0:00 – 0:12 First light");
  expect(text).toContain("0:12 – 0:25 Steam and cup");
  expect(text).toContain("Harbour permit");
});

test("a signed-out request is sent to the sign-in page", async ({ browser }) => {
  const context = await browser.newContext();
  for (const path of [
    `/api/export/shotlist/${creativeId}`,
    `/api/export/shotlist/${creativeId}?format=csv`,
    `/api/export/storyboard/${creativeId}`,
    `/api/export/concept/${conceptId}`,
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, "http://localhost:3000").pathname).toBe("/login");
  }
  await context.close();
});

test("a member who is not in the project gets 404", async ({ browser }) => {
  const context = await browser.newContext();
  const viewer = await context.newPage();
  await signIn(viewer, VIEWER_EMAIL, SEED_PASSWORD);
  await expect(viewer).toHaveURL(/:3000\/$/);

  for (const path of [
    `/api/export/shotlist/${creativeId}`,
    `/api/export/shotlist/${creativeId}?format=csv`,
    `/api/export/storyboard/${creativeId}`,
    `/api/export/concept/${conceptId}`,
    "/api/export/shotlist/not-an-id",
  ]) {
    expect((await viewer.request.get(path)).status()).toBe(404);
  }
  await context.close();
});

test("the company line and logo from the workspace settings appear on exports", async () => {
  const company = `Northlight Films ${run} · Harbour Road 1`;
  await page.goto("/settings/workspace");
  await page.getByLabel("Company line for exports").fill(company);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  for (const path of [
    `/api/export/shotlist/${creativeId}`,
    `/api/export/storyboard/${creativeId}`,
    `/api/export/concept/${conceptId}`,
  ]) {
    expect((await pdfText(await page.request.get(path))).text).toContain(company);
  }

  await expect(page.getByText("No logo yet.")).toBeVisible();
  await page
    .getByTestId("export-logo-input")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Logo saved")).toBeVisible();
  const logo = page.getByTestId("export-logo");
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);

  const stored = must(
    await admin.from("app_settings").select("value").eq("key", "export_logo_path").single(),
  ).value as string;
  expect(stored).toMatch(/^library\/branding\/[0-9a-f-]{36}\.png$/);

  // A PDF with the logo embedded is larger than the same PDF without it.
  const withLogo = await page.request.get(`/api/export/concept/${conceptId}`);
  expect(withLogo.status()).toBe(200);
  expect((await pdfText(withLogo)).text).toContain(company);

  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByText("Logo removed")).toBeVisible();
  await expect(page.getByText("No logo yet.")).toBeVisible();
  const withoutLogo = await page.request.get(`/api/export/concept/${conceptId}`);
  expect((await withLogo.body()).length).toBeGreaterThan((await withoutLogo.body()).length);
  const { data: objects } = await admin.storage.from("media").list("library/branding");
  expect((objects ?? []).map((object) => `library/branding/${object.name}`)).not.toContain(stored);
});

test("a talent is added to the library and its page lists the shot that uses it", async () => {
  const name = `Jon Vale ${run}`;
  await page.goto("/library/talents");
  await page.getByRole("button", { name: "Add talent" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Type", { exact: true }).selectOption({ label: "Animal" });
  await dialog.getByLabel("Date of birth").fill("1990-02-28");
  await dialog.getByLabel("Languages").fill("English, German");
  await dialog.getByLabel("Residence").fill("Hamburg");
  await dialog.getByLabel("Day rate").fill("350.50");
  await dialog.getByLabel("Tags").fill("lead, swimmer");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Animal");
  await expect(row).toContainText("English, German");
  await expect(row).toContainText("350.50");

  const talent = must(
    await admin.from("talents").select("id, daily_rate_cents, languages, tags, birth_date").eq("name", name).single(),
  );
  expect(talent).toMatchObject({
    daily_rate_cents: 35050,
    languages: ["English", "German"],
    tags: ["lead", "swimmer"],
    birth_date: "1990-02-28",
  });

  // The search narrows the list.
  await page.getByLabel("Search").fill(`no such talent ${run}`);
  await expect(page.getByText("Nothing matches your search.")).toBeVisible();
  await page.getByLabel("Search").fill(name);
  await expect(row).toBeVisible();

  must(
    await admin
      .from("shot_talents")
      .insert({ shot_id: secondShotId, talent_id: talent.id })
      .select("id")
      .single(),
  );

  await row.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(`/library/talents/${talent.id}$`));
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Hamburg")).toBeVisible();
  await expect(page.getByText("28 Feb 1990")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();
  const projectLink = page.getByRole("link", { name: `Open the shot list of ${projectName}` });
  await expect(projectLink).toHaveAttribute("href", `/projects/${project.id}/shotlist`);
  const shotLink = page.getByRole("link", { name: /Shot 2/ });
  await expect(shotLink).toContainText("Rope is thrown ashore");
  await expect(shotLink).toHaveAttribute("href", `/projects/${project.id}/shotlist`);

  // A talent that appears in a shot cannot be deleted.
  await page.goto("/library/talents");
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("This talent appears in a shot and cannot be deleted.")).toBeVisible();
  await expect(row).toBeVisible();
});

test("the library lists open from the navigation, talents first", async () => {
  await page.goto("/library/talents");
  const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  const labels = await links.allTextContents();
  expect(labels.slice(labels.indexOf("Talents"), labels.indexOf("Talents") + 3)).toEqual([
    "Talents",
    "Brands",
    "Clients",
  ]);
  for (const [link, add] of [
    ["Brands", "Add brand"],
    ["Clients", "Add client"],
    ["Talents", "Add talent"],
  ]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { name: link, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: add })).toBeVisible();
  }
});

test("a member outside the project does not see its shots on the talent page", async ({ browser }) => {
  const talentId = must(
    await admin.from("talents").select("id").eq("name", castName).single(),
  ).id;
  const context = await browser.newContext();
  const viewer = await context.newPage();
  await signIn(viewer, VIEWER_EMAIL, SEED_PASSWORD);
  await expect(viewer).toHaveURL(/:3000\/$/);
  await viewer.goto(`/library/talents/${talentId}`);
  await expect(viewer.getByRole("heading", { name: castName, level: 1 })).toBeVisible();
  await expect(viewer.getByText("Not used in any shot you have access to.")).toBeVisible();
  await expect(viewer.getByText(projectName)).toHaveCount(0);
  await context.close();
});

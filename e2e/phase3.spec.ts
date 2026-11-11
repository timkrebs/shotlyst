import { expect, test, type Page } from "@playwright/test";

import {
  adminClient,
  createProject,
  PNG,
  SEED_PASSWORD,
  SEED_PROJECT_ID,
  signIn,
} from "./helpers";

const run = Date.now();
const admin = adminClient();
const SHOTS = 100;

test.describe.configure({ mode: "serial" });

let project: { url: string; id: string };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  project = await createProject(page, `E2E Shots ${run}`);
});

test.afterAll(async () => {
  await page.close();
});

async function shotsInDb() {
  const { data, error } = await admin
    .from("shots")
    .select("id, action, audio, duration_sec, position, updated_at, custom_values, segment_id")
    .eq("project_id", project.id);
  if (error) throw new Error(error.message);
  return data.sort((a, b) => (a.position < b.position ? -1 : 1));
}

test("a new project starts with one creative and one segment", async () => {
  await page.goto(`${project.url}/shotlist`);
  await expect(page.getByLabel("Creative", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByTestId("segment")).toHaveCount(1);
  await expect(page.getByLabel("Segment title")).toHaveValue("Segment 1");
});

test("100 shots can be entered by keyboard alone", async () => {
  test.setTimeout(180_000);
  // From here on only the keyboard is used.
  await page.getByRole("button", { name: "Add a shot to Segment 1" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Action, shot 1", { exact: true })).toBeFocused();

  // The first shot is filled across its row with Tab.
  await page.keyboard.type("Wide view of the harbour");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Audio, shot 1", { exact: true })).toBeFocused();
  await page.keyboard.type("Gulls, distant engine");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Good morning");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Action, shot 1", { exact: true })).toBeFocused();

  // Enter in the last row adds the next shot in the same column.
  for (let number = 2; number <= SHOTS; number += 1) {
    await page.keyboard.press("Enter");
    await expect(page.getByLabel(`Action, shot ${number}`, { exact: true })).toBeFocused();
    await page.keyboard.type(`Shot ${number} of the film`);
  }
  await page.keyboard.press("Tab");

  await expect(page.getByTestId("shot-row")).toHaveCount(SHOTS);
  await expect
    .poll(async () => (await shotsInDb()).filter((shot) => shot.action).length, { timeout: 90_000 })
    .toBe(SHOTS);
  const stored = await shotsInDb();
  expect(stored[0]).toMatchObject({
    action: "Wide view of the harbour",
    audio: "Gulls, distant engine",
  });
  expect(stored.map((shot) => shot.action).slice(1, 4)).toEqual([
    "Shot 2 of the film",
    "Shot 3 of the film",
    "Shot 4 of the film",
  ]);
  expect(stored[SHOTS - 1].action).toBe(`Shot ${SHOTS} of the film`);
});

test("a segment total follows every keystroke and turns red over target", async () => {
  const total = page.getByTestId("segment-total");
  await page.getByLabel("Target time of Segment 1 in seconds").fill("10");
  await page.getByLabel("Target time of Segment 1 in seconds").press("Enter");
  await expect(total).toHaveText("0:00 / 0:10");
  await expect(total).toHaveAttribute("data-over", "false");

  const duration = page.getByLabel("Duration (s), shot 1", { exact: true });
  await duration.click();
  await page.keyboard.type("1");
  // Still typing: the total already shows the new value.
  await expect(total).toHaveText("0:01 / 0:10");
  await expect(total).toHaveAttribute("data-over", "false");
  await page.keyboard.type("0");
  await expect(total).toHaveText("0:10 / 0:10");
  await expect(total).toHaveAttribute("data-over", "false");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("1");
  await expect(total).toHaveText("0:11 / 0:10");
  await expect(total).toHaveAttribute("data-over", "true");
  await expect(page.getByTestId("creative-total")).toHaveAttribute("data-over", "true");
  await page.keyboard.press("Tab");
  await expect.poll(async () => (await shotsInDb())[0].duration_sec).toBe(11);
});

test("a reorder writes exactly one row", async () => {
  const before = await shotsInDb();
  const handle = page.getByRole("button", { name: "Move shot 3", exact: true });
  const target = page.getByLabel("Action, shot 1", { exact: true });
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("rows not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y - 10, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + to.height / 2 - 4, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByLabel("Action, shot 1", { exact: true })).toHaveValue("Shot 3 of the film");
  await expect.poll(async () => (await shotsInDb())[0].action).toBe("Shot 3 of the film");
  const after = await shotsInDb();
  const changed = after.filter(
    (shot) => before.find((row) => row.id === shot.id)?.updated_at !== shot.updated_at,
  );
  expect(changed.map((shot) => shot.action)).toEqual(["Shot 3 of the film"]);
  expect(after.slice(0, 3).map((shot) => shot.action)).toEqual([
    "Shot 3 of the film",
    "Wide view of the harbour",
    "Shot 2 of the film",
  ]);
});

test("cast is picked in the cell and an unknown name joins the library", async () => {
  const name = `Nora New ${run}`;
  const cast = page.getByLabel("Cast, shot 1", { exact: true });
  await cast.click();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shot-row").first().getByText(name)).toBeVisible();

  await expect
    .poll(async () => {
      const { data } = await admin.from("talents").select("id, shot_talents(shot_id)").eq("name", name);
      return data?.[0]?.shot_talents.length ?? 0;
    })
    .toBe(1);
});

test("columns can be hidden and custom columns added", async () => {
  await page.getByRole("button", { name: "Columns" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Audio", { exact: true }).click();
  await expect(dialog.getByLabel("Audio", { exact: true })).not.toBeChecked();
  await dialog.getByLabel("Label").fill("VFX");
  await dialog.getByLabel("Type").selectOption("checkbox");
  await dialog.getByRole("button", { name: "Add column" }).click();
  await expect(dialog.getByLabel("VFX", { exact: true })).toBeChecked();
  await page.keyboard.press("Escape");

  const list = page.getByTestId("shot-list");
  await expect(list.getByRole("columnheader", { name: "VFX" })).toBeVisible();
  await expect(list.getByRole("columnheader", { name: "Audio" })).toHaveCount(0);

  // The cell is driven by the client cache, which updates a tick later.
  await page.getByLabel("VFX, shot 2", { exact: true }).click();
  await expect(page.getByLabel("VFX, shot 2", { exact: true })).toBeChecked();
  await expect
    .poll(async () => (await shotsInDb())[1].custom_values)
    .toEqual({ vfx: true });
});

test("frames have versions and one is active", async () => {
  await page.getByRole("button", { name: "Frames of shot 1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This shot has no frame yet.")).toBeVisible();
  for (const name of ["frame-a.png", "frame-b.png"]) {
    await dialog
      .getByTestId("frame-file-input")
      .setInputFiles({ name, mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByTestId("frame-versions").getByRole("listitem")).toHaveCount(
      name === "frame-a.png" ? 1 : 2,
    );
  }
  // The newest upload is active; the older version can take over.
  await expect(dialog.getByText("Active", { exact: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Set active" }).click();
  await expect(dialog.getByRole("button", { name: "Set active" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  const { data: frames } = await admin
    .from("shot_frames")
    .select("id, created_at")
    .eq("project_id", project.id)
    .order("created_at");
  const first = (await shotsInDb())[0];
  const { data: shot } = await admin.from("shots").select("active_frame_id").eq("id", first.id).single();
  expect(frames).toHaveLength(2);
  expect(shot?.active_frame_id).toBe(frames![0].id);
});

test("storyboard, timeline and script show the same shots", async () => {
  await page.getByRole("tab", { name: "Storyboard" }).click();
  const storyboard = page.getByTestId("storyboard");
  await expect(storyboard.getByRole("listitem")).toHaveCount(SHOTS);
  const frame = storyboard.getByRole("listitem").first().locator("img");
  await expect
    .poll(() => frame.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await expect(storyboard.getByRole("listitem").first()).toContainText("Shot 3 of the film");

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("timeline-clock")).toHaveText("0:00 / 0:11");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByTestId("timeline-clock")).toHaveText("0:02 / 0:11", { timeout: 4000 });
  await page.getByRole("button", { name: "Pause" }).click();
  // Only the shot with a duration plays.
  await expect(page.getByTestId("timeline-preview")).toHaveAttribute("data-shot", "2");

  await page.getByRole("tab", { name: "Script" }).click();
  const script = page.getByTestId("script");
  await expect(script.getByRole("row")).toHaveCount(SHOTS + 2);
  await expect(script).toContainText("Gulls, distant engine");
  await expect(script).toContainText("On screen: Good morning");
  await page.getByRole("tab", { name: "List" }).click();
});

test("selected shots can be moved to a new segment, duplicated and deleted", async () => {
  await page.getByLabel("New segment").fill("Finale");
  await page.getByRole("button", { name: "Add segment" }).click();
  await expect(page.getByTestId("segment")).toHaveCount(2);

  await page.getByLabel("Select shot 99", { exact: true }).click();
  await page.getByLabel("Select shot 100", { exact: true }).click();
  await page.getByLabel("Move to segment…").selectOption({ label: "Finale" });
  const finale = page.getByRole("region", { name: "Finale" });
  await expect(finale.getByTestId("shot-row")).toHaveCount(2);

  await page.getByLabel("Select shot 100", { exact: true }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(finale.getByTestId("shot-row")).toHaveCount(3);
  await expect(page.getByLabel("Action, shot 101", { exact: true })).toHaveValue(`Shot ${SHOTS} of the film`);

  await page.getByLabel("Select shot 101", { exact: true }).click();
  await page.getByRole("toolbar", { name: "Selected shots" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(finale.getByTestId("shot-row")).toHaveCount(2);
  await expect.poll(async () => (await shotsInDb()).length).toBe(SHOTS);
});

test("beats of a concept become segments with target times", async () => {
  const { data: concept } = await admin
    .from("concepts")
    .select("id")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .single();
  const beats = [
    { title: "Hook", start_sec: 0, end_sec: 5, position: "G" },
    { title: "Reveal", start_sec: 5, end_sec: 17, position: "V" },
  ].map((beat) => ({ ...beat, project_id: project.id, concept_id: concept!.id }));
  expect((await admin.from("concept_beats").insert(beats)).error).toBeNull();

  await page.goto(`${project.url}/concepts/${concept!.id}`);
  await page.getByRole("button", { name: "Turn beats into segments" }).click();
  await expect(page).toHaveURL(/\/shotlist\?creative=/);
  await expect(page.getByTestId("segment")).toHaveCount(4);
  await expect(page.getByLabel("Target time of Hook in seconds")).toHaveValue("5");
  await expect(page.getByLabel("Target time of Reveal in seconds")).toHaveValue("12");
});

test("duplicating a project copies its structure and shots", async () => {
  await page.goto(`${project.url}/overview`);
  await page.getByRole("button", { name: "Duplicate" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toHaveValue(`Copy of E2E Shots ${run}`);
  await dialog.getByRole("button", { name: "Duplicate" }).click();
  await expect(page).not.toHaveURL(new RegExp(project.id));
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/overview$/);
  const copyId = page.url().split("/").at(-2) as string;
  expect(copyId).not.toBe(project.id);

  const count = async (table: "shots" | "segments" | "shot_frames") =>
    (await admin.from(table).select("id", { count: "exact", head: true }).eq("project_id", copyId)).count;
  expect(await count("shots")).toBe(SHOTS);
  expect(await count("segments")).toBe(4);
  expect(await count("shot_frames")).toBe(0);
});

test("a viewer reads the shot list but cannot edit it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const viewer = await context.newPage();
  await signIn(viewer, "viewer@shotlyst.test", SEED_PASSWORD);
  await expect(viewer).toHaveURL(/:3000\/$/);
  await viewer.goto(`/projects/${SEED_PROJECT_ID}/shotlist`);

  await expect(viewer.getByTestId("shot-row")).toHaveCount(6);
  await expect(viewer.getByLabel("Action, shot 1", { exact: true })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: /^Add a shot to/ })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Columns" })).toHaveCount(0);
  // The seeded segments: one under target, one over.
  const totals = viewer.getByTestId("segment-total");
  await expect(totals.nth(0)).toHaveAttribute("data-over", "false");
  await expect(totals.nth(1)).toHaveAttribute("data-over", "true");
  await context.close();
});

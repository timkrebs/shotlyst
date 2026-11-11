import { expect, test, type Page } from "@playwright/test";

import { adminClient, createProject, PNG } from "./helpers";

const run = Date.now();
const admin = adminClient();

test.describe.configure({ mode: "serial" });

let project: { url: string; id: string };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  project = await createProject(page, `E2E Ideation ${run}`);
});

test.afterAll(async () => {
  await page.close();
});

test("a new project starts with a concept, a moodboard and four task columns", async () => {
  await page.goto(`${project.url}/tasks`);
  for (const column of ["Open", "In progress", "Review", "Done"]) {
    await expect(page.getByTestId(`column-${column}`)).toBeVisible();
  }
  await page.goto(`${project.url}/concepts`);
  await expect(page.getByRole("link", { name: "Treatment" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toHaveCount(1);
});

test("a concept with an image and a table survives a reload", async () => {
  await page.goto(`${project.url}/concepts`);
  await page.getByRole("link", { name: "Treatment" }).click();

  const editor = page.getByLabel("Concept text");
  await editor.click();
  await page.keyboard.type(`Opening on the harbour ${run}`);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Insert table" }).click();
  await page.keyboard.type("Shot");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Mood");

  await page
    .getByTestId("concept-file-input")
    .setInputFiles({ name: "frame.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("concept-image")).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");

  await page.reload();
  await expect(page.getByText(`Opening on the harbour ${run}`)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Shot" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Mood" })).toBeVisible();
  const image = page.getByTestId("concept-image");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
});

test("beats are drawn on the rail and an overlap is flagged", async () => {
  const addBeat = async (title: string, start: string, end: string) => {
    await page.getByRole("button", { name: "Add beat" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Start").fill(start);
    await dialog.getByLabel("End").fill(end);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  };
  await addBeat("Arrival", "0:00", "0:12");
  await addBeat("The pour", "0:10", "0:25");
  await expect(page.getByTestId("beat-issues")).toContainText(
    "Arrival and The pour overlap by 0:02",
  );

  await page.getByLabel("Add an open item to Arrival").fill("Harbour permit");
  await page.getByLabel("Add an open item to Arrival").press("Enter");
  await page.getByRole("checkbox", { name: "Harbour permit" }).click();
  await expect(page.getByRole("checkbox", { name: "Harbour permit" })).toBeChecked();
});

test("setting a second concept active deactivates the first", async () => {
  await page.goto(`${project.url}/concepts`);
  await page.getByRole("button", { name: "New concept" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("Alternative cut");
  await page.getByRole("button", { name: "Create concept" }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Set active" }).click();
  await expect(page.getByText("This concept is now the active one")).toBeVisible();

  const { data } = await admin
    .from("concepts")
    .select("title, is_active")
    .eq("project_id", project.id)
    .order("title");
  expect(data).toEqual([
    { title: "Alternative cut", is_active: true },
    { title: "Treatment", is_active: false },
  ]);
});

async function completedAt(title: string) {
  const { data } = await admin
    .from("tasks")
    .select("completed_at")
    .eq("project_id", project.id)
    .eq("title", title)
    .single();
  return data?.completed_at ?? null;
}

async function dragCardTo(title: string, column: string) {
  const card = page.getByRole("button", { name: `Open ${title}` });
  const target = page.getByTestId(`column-${column}`);
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("card or column not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 70, { steps: 12 });
  await page.mouse.up();
}

test("a card moved to Done sets completed_at, and moving it back clears it", async () => {
  const title = `Book the harbour ${run}`;
  await page.goto(`${project.url}/tasks`);
  await page.getByLabel("Add a task to Open").fill(title);
  await page.getByLabel("Add a task to Open").press("Enter");
  await expect(page.getByTestId("column-Open").getByText(title)).toBeVisible();
  expect(await completedAt(title)).toBeNull();

  await dragCardTo(title, "Done");
  await expect(page.getByTestId("column-Done").getByText(title)).toBeVisible();
  await expect.poll(() => completedAt(title)).not.toBeNull();

  // A new drag is ignored until the drop animation of the last one is over.
  await page.waitForTimeout(500);
  await dragCardTo(title, "In progress");
  await expect(page.getByTestId("column-In progress").getByText(title)).toBeVisible();
  await expect.poll(() => completedAt(title)).toBeNull();
});

test("a task assigned to me and due today shows on Home", async () => {
  const title = `Book the harbour ${run}`;
  await page.getByRole("button", { name: `Open ${title}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Assignee").selectOption({ label: "Olivia Owner" });
  await dialog.getByLabel("Due").fill(new Date().toISOString().slice(0, 10));
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("Olivia Owner");

  await page.goto("/");
  const row = page.getByTestId("home-tasks").getByRole("listitem").filter({ hasText: title });
  await expect(row).toContainText("Due today");
  await expect(row).toContainText(`E2E Ideation ${run}`);
});

async function savedNodes() {
  const { count } = await admin
    .from("moodboard_nodes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);
  return count;
}

test("a moodboard keeps its elements across a reload and supports undo", async () => {
  await page.goto(`${project.url}/moodboard`);
  const board = page.getByTestId("moodboard");
  await page.getByRole("button", { name: "Add a sticky note" }).click();
  await board.getByRole("textbox", { name: "Note" }).fill(`Warm morning light ${run}`);
  await page.getByRole("button", { name: "Add a colour swatch" }).click();
  await expect(board.locator(".react-flow__node")).toHaveCount(2);
  await expect.poll(savedNodes).toBe(2);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(board.locator(".react-flow__node")).toHaveCount(1);
  await expect.poll(savedNodes).toBe(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(board.locator(".react-flow__node")).toHaveCount(2);
  // Changes go out in batches; wait for the last one before leaving.
  await expect.poll(savedNodes).toBe(2);

  await page.reload();
  await expect(board.getByText(`Warm morning light ${run}`)).toBeVisible();
  await expect(board.locator(".react-flow__node")).toHaveCount(2);
});

test("a board with 200 images stays usable", async () => {
  // Arrange: one stored image, placed 200 times on a second board.
  const path = `${project.id}/moodboard/${crypto.randomUUID()}.png`;
  const upload = await admin.storage.from("media").upload(path, PNG, { contentType: "image/png" });
  expect(upload.error).toBeNull();
  const file = await admin
    .from("files")
    .insert({ project_id: project.id, path, name: "tile.png", mime: "image/png", size: PNG.length, kind: "image", width: 1, height: 1 })
    .select("id")
    .single();
  const board = await admin
    .from("moodboards")
    .insert({ project_id: project.id, title: "Two hundred" })
    .select("id")
    .single();
  expect(file.error ?? board.error).toBeNull();
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    project_id: project.id,
    board_id: board.data!.id,
    type: "image",
    x: (index % 20) * 140,
    y: Math.floor(index / 20) * 140,
    width: 120,
    height: 120,
    z: index,
    file_id: file.data!.id,
    data: { fileId: file.data!.id, path, thumbPath: null, name: "tile.png" },
  }));
  expect((await admin.from("moodboard_nodes").insert(nodes)).error).toBeNull();

  await page.goto(`${project.url}/moodboard?board=${board.data!.id}`);
  const canvas = page.getByTestId("moodboard");
  await expect(canvas.locator(".react-flow__node")).toHaveCount(200);
  await expect
    .poll(() =>
      canvas
        .locator(".react-flow__node img")
        .evaluateAll((images) => (images as HTMLImageElement[]).filter((image) => image.naturalWidth > 0).length),
    )
    .toBeGreaterThan(150);

  // Act: drag one image and time the interaction.
  const first = canvas.locator(".react-flow__node").first();
  const box = await first.boundingBox();
  if (!box) throw new Error("node not on screen");
  const started = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 30; step += 1) {
    await page.mouse.move(box.x + box.width / 2 + step * 4, box.y + box.height / 2 + step * 3);
  }
  await page.mouse.up();
  const dragMs = Date.now() - started;

  // Thirty pointer moves over 200 images must not take seconds.
  expect(dragMs).toBeLessThan(3000);
  await expect(page.getByTestId("board-save-state")).toHaveText("Saved");
  await expect
    .poll(async () => {
      const { count } = await admin
        .from("moodboard_nodes")
        .select("id", { count: "exact", head: true })
        .eq("board_id", board.data!.id)
        .or("x.neq.0,y.neq.0")
        .eq("z", 0);
      return count;
    })
    .toBe(1);
});

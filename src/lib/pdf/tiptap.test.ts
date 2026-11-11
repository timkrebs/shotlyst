import { describe, expect, it } from "vitest";

import { imagePaths, tiptapToBlocks, type Block } from "./tiptap";

const text = (value: string, ...marks: string[]) => ({
  type: "text",
  text: value,
  marks: marks.map((type) => ({ type })),
});
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const plain = (value: string) => ({ text: value, bold: false, italic: false });

describe("tiptapToBlocks", () => {
  it("returns nothing for an empty or broken document", () => {
    expect(tiptapToBlocks(null)).toEqual([]);
    expect(tiptapToBlocks("text")).toEqual([]);
    expect(tiptapToBlocks({})).toEqual([]);
    expect(tiptapToBlocks({ type: "doc" })).toEqual([]);
    expect(tiptapToBlocks({ type: "doc", content: [null, 3, { content: [] }] })).toEqual([]);
  });

  it("keeps bold and italic marks and merges neighbours with the same marks", () => {
    const blocks = tiptapToBlocks(
      doc(
        paragraph(
          text("A quiet "),
          text("harbour"),
          text(" at ", "bold"),
          text("dawn", "bold", "italic"),
          text(".", "italic", "underline"),
        ),
      ),
    );
    expect(blocks).toEqual([
      {
        type: "paragraph",
        spans: [
          plain("A quiet harbour"),
          { text: " at ", bold: true, italic: false },
          { text: "dawn", bold: true, italic: true },
          { text: ".", bold: false, italic: true },
        ],
      },
    ]);
  });

  it("turns a hard break into a line break that is never merged", () => {
    const blocks = tiptapToBlocks(doc(paragraph(text("one"), { type: "hardBreak" }, text("two"))));
    expect(blocks).toEqual([
      { type: "paragraph", spans: [plain("one"), plain("\n"), plain("two")] },
    ]);
  });

  it("keeps an empty paragraph as an empty line", () => {
    expect(tiptapToBlocks(doc({ type: "paragraph" }))).toEqual([{ type: "paragraph", spans: [] }]);
  });

  it("reads headings and clamps levels above three", () => {
    const blocks = tiptapToBlocks(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("One")] },
        { type: "heading", attrs: { level: 2 }, content: [text("Two")] },
        { type: "heading", attrs: { level: 5 }, content: [text("Five")] },
        { type: "heading", content: [text("None")] },
      ),
    );
    expect(blocks.map((block) => (block.type === "heading" ? block.level : null))).toEqual([1, 2, 3, 3]);
  });

  it("reads bullet and ordered lists, nested", () => {
    const blocks = tiptapToBlocks(
      doc({
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [
              paragraph(text("Wide")),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph(text("Drone"))] }],
              },
            ],
          },
          { type: "listItem", content: [paragraph(text("Close"))] },
        ],
      }),
    );
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        start: 3,
        items: [
          {
            checked: null,
            blocks: [
              { type: "paragraph", spans: [plain("Wide")] },
              {
                type: "list",
                ordered: false,
                start: 1,
                items: [{ checked: null, blocks: [{ type: "paragraph", spans: [plain("Drone")] }] }],
              },
            ],
          },
          { checked: null, blocks: [{ type: "paragraph", spans: [plain("Close")] }] },
        ],
      },
    ]);
  });

  it("reads to-do lists with their ticks", () => {
    const blocks = tiptapToBlocks(
      doc({
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [paragraph(text("Permit"))] },
          { type: "taskItem", attrs: { checked: false }, content: [paragraph(text("Boat"))] },
          { type: "taskItem", content: [paragraph(text("Crew"))] },
        ],
      }),
    );
    const list = blocks[0];
    expect(list.type === "list" && list.items.map((item) => item.checked)).toEqual([true, false, false]);
  });

  it("reads quotes, rules and code blocks", () => {
    const blocks = tiptapToBlocks(
      doc(
        { type: "blockquote", content: [paragraph(text("Less is more"))] },
        { type: "horizontalRule" },
        { type: "codeBlock", content: [text("INT. BOAT")] },
      ),
    );
    expect(blocks).toEqual([
      { type: "quote", blocks: [{ type: "paragraph", spans: [plain("Less is more")] }] },
      { type: "rule" },
      { type: "paragraph", spans: [plain("INT. BOAT")] },
    ]);
  });

  it("reads tables and marks header cells", () => {
    const cell = (type: string, value: string) => ({ type, content: [paragraph(text(value))] });
    const blocks = tiptapToBlocks(
      doc({
        type: "table",
        content: [
          { type: "tableRow", content: [cell("tableHeader", "Shot"), cell("tableHeader", "Mood")] },
          { type: "tableRow", content: [cell("tableCell", "1"), cell("tableCell", "Calm")] },
          { type: "tableRow", content: [] },
        ],
      }),
    );
    const table = blocks[0];
    if (table.type !== "table") throw new Error("expected a table");
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].map((entry) => entry.header)).toEqual([true, true]);
    expect(table.rows[1].map((entry) => entry.header)).toEqual([false, false]);
    expect(table.rows[1][1].blocks).toEqual([{ type: "paragraph", spans: [plain("Calm")] }]);
  });

  it("reads file images and embedded PDFs", () => {
    const blocks = tiptapToBlocks(
      doc(
        { type: "fileImage", attrs: { fileId: "f1", path: "p/concepts/a.png", alt: "Harbour" } },
        { type: "fileImage", attrs: { fileId: "f2", path: null } },
        { type: "filePdf", attrs: { fileId: "f3", path: "p/concepts/b.pdf", name: "Brief.pdf" } },
      ),
    );
    expect(blocks).toEqual([
      { type: "image", path: "p/concepts/a.png", alt: "Harbour" },
      { type: "pdf", name: "Brief.pdf" },
    ]);
  });

  it("keeps the text of nodes it does not know", () => {
    const blocks = tiptapToBlocks(
      doc(
        { type: "callout", content: [paragraph(text("Inside a wrapper"))] },
        { type: "mention", content: [text("Anna")] },
        { type: "widget" },
      ),
    );
    expect(blocks).toEqual([
      { type: "paragraph", spans: [plain("Inside a wrapper")] },
      { type: "paragraph", spans: [plain("Anna")] },
    ]);
  });
});

describe("imagePaths", () => {
  it("finds images at every depth", () => {
    const image = (path: string): Block => ({ type: "image", path, alt: "" });
    const blocks: Block[] = [
      image("a"),
      { type: "quote", blocks: [image("b")] },
      { type: "list", ordered: false, start: 1, items: [{ checked: null, blocks: [image("c")] }] },
      { type: "table", rows: [[{ header: false, blocks: [image("d")] }]] },
      { type: "rule" },
    ];
    expect(imagePaths(blocks)).toEqual(["a", "b", "c", "d"]);
  });
});

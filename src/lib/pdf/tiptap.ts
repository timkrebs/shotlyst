// Turns the editor's JSON document into a small block model the PDF template
// can draw. Pure: no React, no I/O. Anything unknown is reduced to its text,
// so a document from a newer editor still exports.

export interface Span {
  // "\n" marks a hard break.
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface ListItem {
  // Null for plain list items; true or false for to-do items.
  checked: boolean | null;
  blocks: Block[];
}

export interface TableCell {
  header: boolean;
  blocks: Block[];
}

export type Block =
  | { type: "paragraph"; spans: Span[] }
  | { type: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "quote"; blocks: Block[] }
  | { type: "table"; rows: TableCell[][] }
  | { type: "rule" }
  | { type: "image"; path: string; alt: string }
  | { type: "pdf"; name: string };

interface Node {
  type: string;
  text?: string;
  attrs: Record<string, unknown>;
  marks: string[];
  content: Node[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads untrusted JSON into nodes; whatever is not a node is dropped.
function toNode(value: unknown): Node | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  return {
    type: value.type,
    text: typeof value.text === "string" ? value.text : undefined,
    attrs: isRecord(value.attrs) ? value.attrs : {},
    marks: Array.isArray(value.marks)
      ? value.marks.flatMap((mark) => (isRecord(mark) && typeof mark.type === "string" ? [mark.type] : []))
      : [],
    content: Array.isArray(value.content)
      ? value.content.flatMap((child) => toNode(child) ?? [])
      : [],
  };
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "table",
  "horizontalRule",
  "codeBlock",
  "fileImage",
  "filePdf",
]);

function spansOf(nodes: Node[]): Span[] {
  const spans: Span[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      spans.push({ text: "\n", bold: false, italic: false });
    } else if (node.type === "text") {
      if (!node.text) continue;
      const bold = node.marks.includes("bold");
      const italic = node.marks.includes("italic");
      const last = spans[spans.length - 1];
      // Neighbours with the same marks become one span.
      if (last && last.text !== "\n" && last.bold === bold && last.italic === italic) {
        last.text += node.text;
      } else {
        spans.push({ text: node.text, bold, italic });
      }
    } else {
      spans.push(...spansOf(node.content));
    }
  }
  return spans;
}

function clampLevel(level: unknown): 1 | 2 | 3 {
  return level === 1 || level === 2 ? level : 3;
}

function listItems(nodes: Node[], task: boolean): ListItem[] {
  return nodes
    .filter((node) => node.type === "listItem" || node.type === "taskItem")
    .map((node) => ({
      checked: task ? node.attrs.checked === true : null,
      blocks: blocksOf(node.content),
    }));
}

function tableRows(nodes: Node[]): TableCell[][] {
  return nodes
    .filter((node) => node.type === "tableRow")
    .map((row) =>
      row.content
        .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
        .map((cell) => ({ header: cell.type === "tableHeader", blocks: blocksOf(cell.content) })),
    )
    .filter((row) => row.length > 0);
}

function blocksOf(nodes: Node[]): Block[] {
  const blocks: Block[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
      case "codeBlock":
        blocks.push({ type: "paragraph", spans: spansOf(node.content) });
        break;
      case "heading":
        blocks.push({
          type: "heading",
          level: clampLevel(node.attrs.level),
          spans: spansOf(node.content),
        });
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        blocks.push({
          type: "list",
          ordered: node.type === "orderedList",
          start: typeof node.attrs.start === "number" ? node.attrs.start : 1,
          items: listItems(node.content, node.type === "taskList"),
        });
        break;
      case "blockquote":
        blocks.push({ type: "quote", blocks: blocksOf(node.content) });
        break;
      case "table": {
        const rows = tableRows(node.content);
        if (rows.length > 0) blocks.push({ type: "table", rows });
        break;
      }
      case "horizontalRule":
        blocks.push({ type: "rule" });
        break;
      case "fileImage":
        if (typeof node.attrs.path === "string" && node.attrs.path) {
          blocks.push({
            type: "image",
            path: node.attrs.path,
            alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
          });
        }
        break;
      case "filePdf":
        blocks.push({
          type: "pdf",
          name: typeof node.attrs.name === "string" ? node.attrs.name : "",
        });
        break;
      default:
        // An unknown wrapper keeps its blocks; unknown inline content
        // becomes a paragraph of its text.
        if (node.content.some((child) => BLOCK_TYPES.has(child.type))) {
          blocks.push(...blocksOf(node.content));
        } else {
          const spans = spansOf([node]);
          if (spans.length > 0) blocks.push({ type: "paragraph", spans });
        }
    }
  }
  return blocks;
}

export function tiptapToBlocks(document: unknown): Block[] {
  const root = toNode(document);
  return root ? blocksOf(root.content) : [];
}

// Storage paths of every image in the document, nested ones included.
export function imagePaths(blocks: Block[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "image":
        return [block.path];
      case "quote":
        return imagePaths(block.blocks);
      case "list":
        return block.items.flatMap((item) => imagePaths(item.blocks));
      case "table":
        return block.rows.flatMap((row) => row.flatMap((cell) => imagePaths(cell.blocks)));
      default:
        return [];
    }
  });
}

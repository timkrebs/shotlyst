"use client";

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Table as TableIcon,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { registerFile } from "@/features/files/actions";
import { prepareFile, uploadToStorage } from "@/features/files/upload";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { saveConceptContent } from "../actions";
import { FileImage, FilePdf } from "./file-nodes";

const SAVE_DELAY_MS = 800;
type SaveState = "saved" | "dirty" | "saving" | "error";

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection while clicking a button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex size-8 items-center justify-center rounded-md disabled:opacity-40",
        active && "bg-accent",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function Toolbar({ editor, onPickFile }: { editor: Editor; onPickFile: (accept: string) => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      h1: current.isActive("heading", { level: 1 }),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      tasks: current.isActive("taskList"),
      quote: current.isActive("blockquote"),
      table: current.isActive("table"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const labels = en.concepts.editor;

  return (
    <div
      role="toolbar"
      aria-label={labels.toolbar}
      className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b p-1"
    >
      <ToolbarButton icon={Bold} label={labels.bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton icon={Italic} label={labels.italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton icon={Heading1} label={labels.heading1} active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton icon={Heading2} label={labels.heading2} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton icon={Heading3} label={labels.heading3} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <ToolbarButton icon={List} label={labels.bulletList} active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label={labels.orderedList} active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <ToolbarButton icon={ListChecks} label={labels.taskList} active={state.tasks} onClick={() => chain().toggleTaskList().run()} />
      <ToolbarButton icon={Quote} label={labels.quote} active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolbarButton
        icon={TableIcon}
        label={labels.insertTable}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      {state.table ? (
        <>
          <button type="button" className="hover:bg-accent rounded-md px-2 py-1 text-xs" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addRowAfter().run()}>
            {labels.addRow}
          </button>
          <button type="button" className="hover:bg-accent rounded-md px-2 py-1 text-xs" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addColumnAfter().run()}>
            {labels.addColumn}
          </button>
          <ToolbarButton icon={Trash2} label={labels.deleteTable} onClick={() => chain().deleteTable().run()} />
        </>
      ) : null}
      <ToolbarButton icon={ImagePlus} label={labels.insertImage} onClick={() => onPickFile("image/*")} />
      <ToolbarButton icon={FileText} label={labels.insertPdf} onClick={() => onPickFile("application/pdf")} />
      <ToolbarButton icon={Undo2} label={labels.undo} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <ToolbarButton icon={Redo2} label={labels.redo} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
    </div>
  );
}

// The treatment editor. Changes are saved continuously, a short moment after
// the last keystroke.
export function ConceptEditor({
  projectId,
  conceptId,
  initialContent,
  editable,
}: {
  projectId: string;
  conceptId: string;
  initialContent: JSONContent;
  editable: boolean;
}) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<JSONContent | null>(null);
  const logged = useRef(false);
  const saving = useRef(false);

  const save = useCallback(async () => {
    // One save at a time; a change made meanwhile is picked up afterwards.
    if (saving.current || !latest.current) return;
    saving.current = true;
    while (latest.current) {
      const content = latest.current;
      latest.current = null;
      setSaveState("saving");
      const result = await saveConceptContent({
        projectId,
        conceptId,
        content: content as { type: "doc"; content?: unknown[] },
        logEdit: !logged.current,
      });
      if (result.ok) {
        logged.current = true;
        if (!latest.current) setSaveState("saved");
      } else {
        setSaveState("error");
        toast.error(result.error);
        break;
      }
    }
    saving.current = false;
  }, [conceptId, projectId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: en.concepts.editor.placeholder }),
      FileImage,
      FilePdf,
    ],
    content: initialContent,
    editable,
    // Rendered on the client only, so server and client markup cannot differ.
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": en.concepts.editor.label } },
    onUpdate: ({ editor: current }) => {
      // Node attributes are prototype-less objects, which a Server Action
      // would drop; a JSON round trip turns the document into plain data.
      latest.current = JSON.parse(JSON.stringify(current.getJSON())) as JSONContent;
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
  });

  // Do not lose the last keystrokes when leaving the page.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void save();
    };
  }, [save]);

  async function onFile(file: File | undefined) {
    if (!file || !editor) return;
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(en.files.errors.tooLarge);
      const prepared = await prepareFile(file);
      const path = await uploadToStorage(prepared, projectId, "concepts");
      const result = await registerFile({
        projectId,
        path,
        name: prepared.name,
        mime: prepared.mime,
        size: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
        folder: null,
      });
      if (!result.ok) throw new Error(result.error);
      const isPdf = prepared.mime === "application/pdf";
      editor
        .chain()
        .focus()
        .insertContent({
          type: isPdf ? "filePdf" : "fileImage",
          attrs: isPdf
            ? { fileId: result.data.id, path, name: prepared.name }
            : { fileId: result.data.id, path, alt: prepared.name },
        })
        .run();
    } catch (error) {
      toast.error(en.files.errors.uploadFailed(file.name), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="concept-editor overflow-hidden rounded-lg border">
      {editor && editable ? (
        <Toolbar
          editor={editor}
          onPickFile={(accept) => {
            if (!fileInput.current) return;
            fileInput.current.accept = accept;
            fileInput.current.click();
          }}
        />
      ) : null}
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        data-testid="concept-file-input"
        aria-label={en.concepts.editor.insertImage}
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <EditorContent editor={editor} className="min-h-96 p-4" />
      {editable ? (
        <p
          className="text-muted-foreground border-t px-4 py-1.5 text-xs"
          role="status"
          data-testid="save-state"
        >
          {en.concepts.editor.saveState[saveState]}
        </p>
      ) : null}
    </div>
  );
}

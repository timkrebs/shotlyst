"use client";

import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ExternalLink } from "lucide-react";
import { createContext, memo, useContext, type ReactNode } from "react";

import { useSignedUrl } from "@/lib/storage-client";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

export type BoardNode = Node<Record<string, unknown>>;

// Whether the viewer may edit, and a hook to record an undo step before a
// node's content changes.
export const BoardEditContext = createContext<{ canEdit: boolean; commit: () => void }>({
  canEdit: false,
  commit: () => {},
});

const text = (value: unknown) => (typeof value === "string" ? value : "");

// Resize frame and the four connection points every node shares.
function Frame({
  selected,
  keepAspectRatio,
  children,
}: {
  selected: boolean;
  keepAspectRatio?: boolean;
  children: ReactNode;
}) {
  const { canEdit, commit } = useContext(BoardEditContext);
  return (
    <>
      <NodeResizer
        isVisible={selected && canEdit}
        minWidth={40}
        minHeight={40}
        keepAspectRatio={keepAspectRatio}
        onResizeStart={commit}
      />
      {children}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={position}
          id={position}
          type="source"
          position={position}
          isConnectable={canEdit}
          className="!size-2.5 opacity-0 transition-opacity group-hover:opacity-100"
        />
      ))}
    </>
  );
}

const ImageNode = memo(function ImageNode({ data, selected }: NodeProps<BoardNode>) {
  // Boards show the small preview; the original stays in the file library.
  const url = useSignedUrl(text(data.thumbPath) || text(data.path));
  return (
    <div className="group size-full">
      <Frame selected={selected} keepAspectRatio>
        {url ? (
          <img
            src={url}
            alt={text(data.name)}
            draggable={false}
            loading="lazy"
            crossOrigin="anonymous"
            className="size-full rounded-sm object-cover shadow-sm"
          />
        ) : (
          <div className="bg-muted size-full animate-pulse rounded-sm" />
        )}
      </Frame>
    </div>
  );
});

function EditableText({
  id,
  field,
  value,
  selected,
  placeholder,
  className,
}: {
  id: string;
  field: string;
  value: string;
  selected: boolean;
  placeholder: string;
  className?: string;
}) {
  const { canEdit, commit } = useContext(BoardEditContext);
  const { updateNodeData } = useReactFlow();
  // Typing is possible only while the node is selected, so a plain drag
  // still moves it.
  if (!selected || !canEdit) {
    return (
      <p className={cn("size-full overflow-hidden whitespace-pre-wrap", className)}>
        {value || <span className="opacity-50">{placeholder}</span>}
      </p>
    );
  }
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onFocus={commit}
      onChange={(event) => updateNodeData(id, { [field]: event.target.value })}
      className={cn("nodrag nowheel size-full resize-none bg-transparent outline-none", className)}
    />
  );
}

const NoteNode = memo(function NoteNode({ id, data, selected }: NodeProps<BoardNode>) {
  return (
    <div className="group size-full rounded-sm bg-amber-200 p-3 text-sm text-amber-950 shadow-md">
      <Frame selected={selected}>
        <EditableText
          id={id}
          field="text"
          value={text(data.text)}
          selected={selected}
          placeholder={en.moodboard.nodes.notePlaceholder}
        />
      </Frame>
    </div>
  );
});

const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<BoardNode>) {
  return (
    <div className="group size-full p-1">
      <Frame selected={selected}>
        <EditableText
          id={id}
          field="text"
          value={text(data.text)}
          selected={selected}
          placeholder={en.moodboard.nodes.textPlaceholder}
          className="text-xl font-semibold"
        />
      </Frame>
    </div>
  );
});

const ColorNode = memo(function ColorNode({ id, data, selected }: NodeProps<BoardNode>) {
  const { canEdit, commit } = useContext(BoardEditContext);
  const { updateNodeData } = useReactFlow();
  const color = text(data.color) || "#888888";
  return (
    <div className="group bg-card flex size-full flex-col overflow-hidden rounded-md border shadow-sm">
      <Frame selected={selected}>
        <div className="flex-1" style={{ backgroundColor: color }} />
        <div className="flex items-center justify-between gap-1 px-2 py-1 font-mono text-xs uppercase">
          {color}
          {selected && canEdit ? (
            <input
              type="color"
              value={color}
              aria-label={en.moodboard.nodes.pickColor}
              className="nodrag size-5 cursor-pointer"
              onFocus={commit}
              onChange={(event) => updateNodeData(id, { color: event.target.value })}
            />
          ) : null}
        </div>
      </Frame>
    </div>
  );
});

const LinkNode = memo(function LinkNode({ id, data, selected }: NodeProps<BoardNode>) {
  const { canEdit, commit } = useContext(BoardEditContext);
  const { updateNodeData } = useReactFlow();
  const url = text(data.url);
  const safeUrl = /^https?:\/\//.test(url) ? url : null;
  const editing = selected && canEdit;
  return (
    <div className="group bg-card flex size-full flex-col justify-center gap-1 rounded-md border p-3 shadow-sm">
      <Frame selected={selected}>
        {editing ? (
          <>
            <input
              value={text(data.title)}
              placeholder={en.moodboard.nodes.linkTitle}
              aria-label={en.moodboard.nodes.linkTitle}
              className="nodrag bg-transparent text-sm font-medium outline-none"
              onFocus={commit}
              onChange={(event) => updateNodeData(id, { title: event.target.value })}
            />
            <input
              value={url}
              placeholder="https://"
              aria-label={en.moodboard.nodes.linkUrl}
              className="nodrag text-muted-foreground bg-transparent text-xs outline-none"
              onFocus={commit}
              onChange={(event) => updateNodeData(id, { url: event.target.value })}
            />
          </>
        ) : (
          <>
            <p className="truncate text-sm font-medium">
              {text(data.title) || en.moodboard.nodes.linkTitle}
            </p>
            {safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noreferrer"
                className="nodrag text-muted-foreground flex items-center gap-1 truncate text-xs hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{safeUrl}</span>
              </a>
            ) : (
              <p className="text-muted-foreground truncate text-xs">{url || "https://"}</p>
            )}
          </>
        )}
      </Frame>
    </div>
  );
});

const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps<BoardNode>) {
  const { canEdit, commit } = useContext(BoardEditContext);
  const { updateNodeData } = useReactFlow();
  return (
    <div className="group border-muted-foreground/40 bg-muted/30 size-full rounded-lg border-2 border-dashed">
      <Frame selected={selected}>
        {selected && canEdit ? (
          <input
            value={text(data.label)}
            placeholder={en.moodboard.nodes.groupLabel}
            aria-label={en.moodboard.nodes.groupLabel}
            className="nodrag absolute -top-6 left-0 bg-transparent text-xs font-medium outline-none"
            onFocus={commit}
            onChange={(event) => updateNodeData(id, { label: event.target.value })}
          />
        ) : (
          <p className="text-muted-foreground absolute -top-6 left-0 text-xs font-medium">
            {text(data.label) || en.moodboard.nodes.groupLabel}
          </p>
        )}
      </Frame>
    </div>
  );
});

export const boardNodeTypes = {
  image: ImageNode,
  note: NoteNode,
  text: TextNode,
  color: ColorNode,
  link: LinkNode,
  group: GroupNode,
};

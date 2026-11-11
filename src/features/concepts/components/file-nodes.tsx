"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";

import { useSignedUrl } from "@/lib/storage-client";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

// Editor nodes for files from the project library. The document stores the
// file ID and storage path; the signed URL is resolved when the node renders,
// so saved documents never contain a link that expires.

function FileImageView({ node, selected }: ReactNodeViewProps) {
  const url = useSignedUrl(node.attrs.path as string);
  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      {url ? (
        <img
          src={url}
          alt={(node.attrs.alt as string) || ""}
          data-testid="concept-image"
          className={cn("max-h-[32rem] rounded-md", selected && "ring-ring ring-2")}
        />
      ) : (
        <div className="bg-muted text-muted-foreground flex h-32 items-center justify-center rounded-md text-sm">
          {en.concepts.editor.loadingFile}
        </div>
      )}
    </NodeViewWrapper>
  );
}

function FilePdfView({ node, selected }: ReactNodeViewProps) {
  const url = useSignedUrl(node.attrs.path as string);
  const name = node.attrs.name as string;
  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <div className={cn("overflow-hidden rounded-md border", selected && "ring-ring ring-2")}>
        <p className="bg-muted px-3 py-1.5 text-xs font-medium">{name}</p>
        {url ? (
          <iframe src={url} title={name} className="h-96 w-full" />
        ) : (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {en.concepts.editor.loadingFile}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const fileAttributes = {
  fileId: { default: null },
  path: { default: null },
};

export const FileImage = Node.create({
  name: "fileImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { ...fileAttributes, alt: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-file-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes({ "data-file-image": "" }, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileImageView);
  },
});

export const FilePdf = Node.create({
  name: "filePdf",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { ...fileAttributes, name: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-file-pdf]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes({ "data-file-pdf": "" }, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FilePdfView);
  },
});

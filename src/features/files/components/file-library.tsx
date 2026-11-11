"use client";

import { FileIcon, FileText, Film, MoreHorizontal, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { setProjectCover } from "@/features/projects/actions";
import { useAction } from "@/hooks/use-action";
import { formatBytes, MAX_UPLOAD_BYTES } from "@/lib/files";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { deleteFile, registerFile } from "../actions";
import type { ProjectFile } from "../queries";
import { prepareFile, uploadToStorage } from "../upload";

const ALL = "__all__";

export function FileLibrary({
  projectId,
  coverFileId,
  files,
}: {
  projectId: string;
  coverFileId: string | null;
  files: ProjectFile[];
}) {
  const router = useRouter();
  const { canEdit } = usePermissions(projectId);
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(ALL);
  const [newFolder, setNewFolder] = useState("");
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [deleting, setDeleting] = useState<ProjectFile | null>(null);
  const remove = useAction(deleteFile, { successMessage: en.common.deleted });
  const cover = useAction(setProjectCover, { successMessage: en.common.saved });

  const folders = useMemo(
    () => [...new Set(files.map((file) => file.folder).filter((name): name is string => !!name))].sort(),
    [files],
  );
  const visible = folder === ALL ? files : files.filter((file) => file.folder === folder);
  const targetFolder = newFolder.trim() || (folder === ALL ? "" : folder);

  async function upload(list: FileList | File[]) {
    const selected = [...list];
    if (selected.length === 0) return;
    setUploading(selected.length);
    let failed = 0;
    for (const file of selected) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(en.files.errors.tooLarge);
        const prepared = await prepareFile(file);
        const path = await uploadToStorage(prepared, projectId, "files");
        const result = await registerFile({
          projectId,
          path,
          name: prepared.name,
          mime: prepared.mime,
          size: prepared.blob.size,
          width: prepared.width,
          height: prepared.height,
          folder: targetFolder,
        });
        if (!result.ok) throw new Error(result.error);
      } catch (error) {
        failed += 1;
        toast.error(en.files.errors.uploadFailed(file.name), {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (failed < selected.length) toast.success(en.files.uploaded(selected.length - failed));
    setNewFolder("");
    router.refresh();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (canEdit) void upload(event.dataTransfer.files);
  }

  return (
    <div
      className={cn("grid gap-4 rounded-lg", dragging && "outline-ring outline-2 outline-dashed")}
      onDragOver={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={folder === ALL ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setFolder(ALL)}
        >
          {en.files.allFiles}
        </Button>
        {folders.map((name) => (
          <Button
            key={name}
            variant={folder === name ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFolder(name)}
          >
            {name}
          </Button>
        ))}
        {canEdit ? (
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
              placeholder={en.files.folderPlaceholder}
              aria-label={en.files.folderPlaceholder}
              className="h-8 w-40"
              maxLength={80}
            />
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              data-testid="file-input"
              aria-label={en.files.upload}
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files);
                event.target.value = "";
              }}
            />
            <Button size="sm" disabled={uploading > 0} onClick={() => input.current?.click()}>
              <Upload />
              {uploading > 0 ? en.files.uploading(uploading) : en.files.upload}
            </Button>
          </div>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          {canEdit ? en.files.emptyEditor : en.files.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((file) => (
            <li key={file.id} className="bg-card overflow-hidden rounded-lg border">
              <button
                type="button"
                className="bg-muted flex aspect-square w-full items-center justify-center overflow-hidden"
                aria-label={en.files.open(file.name)}
                onClick={() => setPreview(file)}
              >
                {file.kind === "image" && file.url ? (
                  <img src={file.url} alt="" loading="lazy" className="size-full object-cover" />
                ) : file.kind === "pdf" ? (
                  <FileText className="text-muted-foreground size-10" aria-hidden />
                ) : file.kind === "video" ? (
                  <Film className="text-muted-foreground size-10" aria-hidden />
                ) : (
                  <FileIcon className="text-muted-foreground size-10" aria-hidden />
                )}
              </button>
              <div className="flex items-start gap-1 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatBytes(file.size)}
                    {file.uploader ? ` · ${file.uploader.display_name}` : ""}
                  </p>
                  {file.id === coverFileId ? (
                    <Badge variant="secondary" className="mt-1">
                      {en.files.cover}
                    </Badge>
                  ) : null}
                </div>
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={en.files.actionsFor(file.name)}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {file.kind === "image" ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            cover.run({
                              projectId,
                              fileId: file.id === coverFileId ? null : file.id,
                            })
                          }
                        >
                          {file.id === coverFileId ? en.files.removeCover : en.files.setCover}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(file)}>
                        {en.common.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.url ? (
            <div data-testid="file-preview" className="grid gap-3">
              {preview.kind === "image" ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-[70dvh] w-full object-contain"
                />
              ) : preview.kind === "pdf" ? (
                <iframe src={preview.url} title={preview.name} className="h-[70dvh] w-full" />
              ) : preview.kind === "video" ? (
                <video src={preview.url} controls className="max-h-[70dvh] w-full" />
              ) : (
                <p className="text-muted-foreground text-sm">{en.files.noPreview}</p>
              )}
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                {en.files.openOriginal}
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{en.files.noPreview}</p>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={en.files.deleteTitle(deleting?.name ?? "")}
        description={en.files.deleteDescription}
        confirmLabel={en.common.delete}
        pending={remove.pending}
        onConfirm={() => {
          if (deleting) remove.run({ projectId, fileId: deleting.id });
          setDeleting(null);
        }}
      />
    </div>
  );
}

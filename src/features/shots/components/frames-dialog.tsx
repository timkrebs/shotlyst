"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { registerFile } from "@/features/files/actions";
import { uploadToStorage } from "@/features/files/upload";
import { useAction } from "@/hooks/use-action";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { useSignedUrl } from "@/lib/storage-client";
import { createClient } from "@/lib/supabase/client";
import { en } from "@/messages/en";

import { addFrame, deleteFrame, setActiveFrame } from "../actions";
import { cropToAspect } from "../crop";
import { listShotFrames } from "../queries";

function Thumb({ path, ratio }: { path: string; ratio: number }) {
  const url = useSignedUrl(path);
  return (
    <div className="bg-muted overflow-hidden rounded" style={{ aspectRatio: ratio }}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

// The frame versions of one shot: upload, pick from the file library, choose
// the active one.
export function FramesDialog({
  projectId,
  shotId,
  shotNumber,
  activeFrameId,
  aspectRatio,
  canEdit,
  onChanged,
  onClose,
}: {
  projectId: string;
  shotId: string;
  shotNumber: string;
  activeFrameId: string | null;
  aspectRatio: number;
  canEdit: boolean;
  // Called after a change, so the shot list reloads its frames.
  onChanged: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);

  const frames = useQuery({
    queryKey: ["shot-frames", shotId],
    queryFn: () => listShotFrames(createClient(), shotId),
    staleTime: 0,
  });
  const library = useQuery({
    queryKey: ["library-images", projectId],
    enabled: picking,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("files")
        .select("id, path, name")
        .eq("project_id", projectId)
        .eq("kind", "image")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ["shot-frames", shotId] });
    onChanged();
  };
  const add = useAction(addFrame, { onSuccess: changed });
  const activate = useAction(setActiveFrame, { onSuccess: changed });
  const remove = useAction(deleteFrame, { onSuccess: changed });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(en.files.errors.tooLarge);
      // Uploaded frames are cropped to the aspect ratio of the film.
      const prepared = await cropToAspect(file, aspectRatio);
      const path = await uploadToStorage(prepared, projectId, "frames");
      const result = await registerFile({
        projectId,
        path,
        name: prepared.name,
        mime: prepared.mime,
        size: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
        folder: en.shots.frames.folder,
      });
      if (!result.ok) throw new Error(result.error);
      add.run({ projectId, shotId, fileId: result.data.id, source: "upload" });
    } catch (error) {
      toast.error(en.files.errors.uploadFailed(file.name), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  const labels = en.shots.frames;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{labels.title(shotNumber)}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="frame-file-input"
              aria-label={labels.upload}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button size="sm" disabled={uploading || add.pending} onClick={() => input.current?.click()}>
              {uploading ? labels.uploading : labels.upload}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPicking((value) => !value)}>
              {labels.fromLibrary}
            </Button>
          </div>
        ) : null}

        {picking ? (
          <div className="grid gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{labels.pickReference}</p>
            {library.data?.length === 0 ? (
              <p className="text-muted-foreground text-sm">{labels.libraryEmpty}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {library.data?.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    aria-label={labels.use(file.name)}
                    className="hover:ring-ring rounded hover:ring-2"
                    onClick={() => {
                      add.run({ projectId, shotId, fileId: file.id, source: "reference" });
                      setPicking(false);
                    }}
                  >
                    <Thumb path={file.path} ratio={aspectRatio} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {frames.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">{labels.empty}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="frame-versions">
            {frames.data?.map((frame) => {
              const active = frame.id === activeFrameId;
              return (
                <li key={frame.id} className="grid gap-2">
                  <Thumb path={frame.file.path} ratio={aspectRatio} />
                  <div className="flex flex-wrap items-center gap-1">
                    {active ? <Badge>{labels.active}</Badge> : null}
                    <Badge variant="outline">{labels.source[frame.source as "upload" | "reference" | "ai"]}</Badge>
                    {canEdit ? (
                      <span className="ml-auto flex gap-1">
                        {active ? null : (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={activate.pending}
                            onClick={() => activate.run({ projectId, shotId, frameId: frame.id })}
                          >
                            {labels.setActive}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={remove.pending}
                          onClick={() => remove.run({ projectId, frameId: frame.id })}
                        >
                          {en.common.delete}
                        </Button>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

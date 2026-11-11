"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { prepareFile, uploadToStorage } from "@/features/files/upload";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { setAvatar, updateProfile } from "../actions";

export function ProfileForm({
  displayName,
  color,
  avatarUrl,
}: {
  displayName: string;
  color: string;
  avatarUrl: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const save = useAction(updateProfile, { inlineError: true, successMessage: en.common.saved });
  const avatar = useAction(setAvatar, { successMessage: en.profile.avatarSaved });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.run({
      displayName: String(form.get("displayName") ?? ""),
      color: String(form.get("color") ?? ""),
    });
  }

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareFile(file);
      const path = await uploadToStorage(prepared, null, "avatars");
      avatar.run({
        path,
        name: prepared.name,
        mime: prepared.mime,
        size: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
    } catch {
      toast.error(en.profile.errors.saveFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4">
      <div className="flex items-center gap-4">
        <UserAvatar name={displayName} color={color} url={avatarUrl} className="size-16" />
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={en.profile.changeAvatar}
          onChange={(event) => {
            void onAvatar(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || avatar.pending}
          onClick={() => input.current?.click()}
        >
          {en.profile.changeAvatar}
        </Button>
      </div>
      <FormField id="displayName" label={en.auth.displayName}>
        <Input id="displayName" name="displayName" defaultValue={displayName} required />
      </FormField>
      <FormField id="color" label={en.profile.color} hint={en.profile.colorHint}>
        <Input id="color" name="color" type="color" defaultValue={color} className="h-9 w-20 p-1" />
      </FormField>
      <FormError message={save.error} />
      <div>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? en.common.saving : en.common.save}
        </Button>
      </div>
    </form>
  );
}

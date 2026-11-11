"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { prepareFile, uploadToStorage } from "@/features/files/upload";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { removeExportLogo, setExportLogo } from "../actions";
import { EXPORT_LOGO_MAX_BYTES, EXPORT_LOGO_TYPES } from "../schema";

// The logo printed on every PDF. The file goes from the browser straight to
// storage; the Server Action then checks it and stores its path.
export function ExportLogoForm({ logoUrl }: { logoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const save = useAction(setExportLogo, { successMessage: en.settings.logoSaved });
  const remove = useAction(removeExportLogo, { successMessage: en.settings.logoRemoved });
  const busy = uploading || save.pending || remove.pending;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!EXPORT_LOGO_TYPES.includes(file.type)) {
      toast.error(en.settings.errors.logoType);
      return;
    }
    if (file.size > EXPORT_LOGO_MAX_BYTES) {
      toast.error(en.settings.errors.logoTooLarge);
      return;
    }
    setUploading(true);
    try {
      const path = await uploadToStorage(await prepareFile(file), null, "branding");
      save.run({ path });
    } catch {
      toast.error(en.settings.errors.logoFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mt-8 grid max-w-md gap-3" aria-labelledby="export-logo-title">
      <div>
        <h2 id="export-logo-title" className="text-sm font-medium">
          {en.settings.exportLogo}
        </h2>
        <p className="text-muted-foreground text-xs">{en.settings.exportLogoHint}</p>
      </div>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={en.settings.exportLogoAlt}
          data-testid="export-logo"
          className="max-h-16 max-w-60 rounded-md border bg-white object-contain p-2"
        />
      ) : (
        <p className="text-muted-foreground text-sm">{en.settings.noExportLogo}</p>
      )}
      <input
        ref={input}
        type="file"
        accept={EXPORT_LOGO_TYPES.join(",")}
        className="sr-only"
        aria-label={logoUrl ? en.settings.replaceLogo : en.settings.uploadLogo}
        data-testid="export-logo-input"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {logoUrl ? en.settings.replaceLogo : en.settings.uploadLogo}
        </Button>
        {logoUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => remove.run({})}
          >
            {en.settings.removeLogo}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

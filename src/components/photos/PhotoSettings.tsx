"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { usePhotos } from "@/hooks/useHub";
import { useTouchWall } from "@/hooks/useTouchWall";
import { PHOTO_MAX_EDGE } from "@/lib/photos/types";

// Settings → Photos: how many family photos Home is cycling through, and a way
// to add more from this phone or laptop. Each picture is shrunk in the browser
// before it is sent, so a batch from a phone goes up quickly and the original
// never leaves the device. Taking a photo down happens on Home: tap it.

/** Shrink a picture to a JPEG no longer than PHOTO_MAX_EDGE on its long side. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.85),
  );
}

export function PhotoSettings() {
  const isWall = useTouchWall();
  const photos = usePhotos();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const add = async (files: File[]) => {
    if (files.length === 0) return;
    setNote(null);
    setProgress({ done: 0, total: files.length });
    let added = 0;
    let failed = 0;
    let full = false;
    for (const file of files) {
      try {
        const res = await fetch("/api/photos", {
          method: "POST",
          headers: {
            "content-type": "image/jpeg",
            "x-photo-taken": new Date(file.lastModified).toISOString(),
          },
          body: await shrink(file),
        });
        if (res.status === 409) {
          full = true;
          break;
        }
        if (!res.ok) throw new Error(String(res.status));
        added += 1;
      } catch {
        failed += 1;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    await photos.refetch();
    setNote(
      full
        ? { text: "Hearth is holding as many photos as it keeps. Remove some on Home first.", bad: true }
        : failed > 0
          ? { text: `Added ${added}. ${failed} couldn't be read or sent.`, bad: true }
          : { text: `Added ${added} ${added === 1 ? "photo" : "photos"}.`, bad: false },
    );
  };

  const count = photos.data?.photos.length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-fg">
        {photos.isLoading
          ? "Checking…"
          : count === 0
            ? "No photos yet. Add some and Home shows them behind the clock, one at a time."
            : `Home is showing ${count} ${count === 1 ? "photo" : "photos"}, one at a time.`}
      </p>
      {photos.data && !photos.data.durable && (
        <p className="rounded-2xl bg-bad-soft px-4 py-3 text-small text-bad">
          Storage isn&rsquo;t set up on the server, so photos added now will be lost at the next update.
        </p>
      )}

      {!isWall && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void add(files);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={progress !== null}
            className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-small font-semibold text-on-accent active:scale-95 disabled:opacity-50"
          >
            {progress ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2.5} aria-hidden />
            ) : (
              <ImagePlus className="size-4" strokeWidth={2.5} aria-hidden />
            )}
            {progress ? `Adding ${progress.done + 1} of ${progress.total}…` : "Add photos"}
          </button>
          {note && (
            <p role="status" className={`text-small ${note.bad ? "text-bad" : "text-good"}`}>
              {note.text}
            </p>
          )}
        </div>
      )}

      <p className="text-small text-fg-faint">
        {isWall ? "Add photos from a phone or laptop: Settings, then Photos. " : ""}
        To take one down, tap it on Home and choose &ldquo;Don&rsquo;t show&rdquo;. Photos stay on
        Hearth and only paired screens can see them.
      </p>
    </div>
  );
}

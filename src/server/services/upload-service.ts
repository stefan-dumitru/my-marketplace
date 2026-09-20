import "server-only";
import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { validateImageFile, ALLOWED_IMAGE_MIME_TYPES } from "@/lib/uploads";

type SniffedType = "jpeg" | "png" | "webp";

const EXTENSION_FOR: Record<SniffedType, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

const CONTENT_TYPE_FOR: Record<SniffedType, (typeof ALLOWED_IMAGE_MIME_TYPES)[number]> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Magic-byte sniff — the actual content-sanitization step. `file.type` is a client-supplied
 * claim and never trusted on its own; this checks the real bytes so a renamed/mislabeled file
 * can't ride in on a spoofed Content-Type.
 */
function sniffImageType(bytes: Uint8Array): SniffedType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

type UploadResult = { ok: true; url: string } | { ok: false; error: string };
type UploadManyResult = { ok: true; urls: string[] } | { ok: false; error: string };

export async function uploadImage(file: File, prefix: string): Promise<UploadResult> {
  const validationError = validateImageFile(file);
  if (validationError) return { ok: false, error: validationError };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return { ok: false, error: "That file doesn't look like a valid JPEG, PNG, or WebP image." };
  }

  const filename = `${randomUUID()}.${EXTENSION_FOR[sniffed]}`;
  const blob = await put(`${prefix}/${filename}`, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: CONTENT_TYPE_FOR[sniffed],
  });

  return { ok: true, url: blob.url };
}

export async function uploadImages(files: File[], prefix: string, max: number): Promise<UploadManyResult> {
  if (files.length > max) {
    return { ok: false, error: `You can upload at most ${max} images.` };
  }

  const urls: string[] = [];
  for (const file of files) {
    const result = await uploadImage(file, prefix);
    if (!result.ok) return result;
    urls.push(result.url);
  }
  return { ok: true, urls };
}

/**
 * Best-effort cleanup, mirroring this codebase's existing `.catch(() => {})` convention for
 * non-critical side effects (e.g. notifyUser in seller-order-service.ts) — a failed delete never
 * fails the save that triggered it. Silently skipped for anything that isn't our own Blob store
 * (e.g. a URL pasted before this pipeline existed), so migration-era data is never touched.
 */
export async function deleteImageIfManaged(url: string): Promise<void> {
  if (!/\.public\.blob\.vercel-storage\.com\//.test(url)) return;
  try {
    await del(url);
  } catch {
    // Best-effort — an orphaned blob is a storage-cost nuisance, not a correctness problem.
  }
}

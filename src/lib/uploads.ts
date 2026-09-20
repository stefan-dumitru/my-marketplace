// No "server-only" import — used both client-side (instant per-file feedback on selection) and
// server-side (authoritative check, before the more expensive magic-byte sniff in
// upload-service.ts) so the two never drift, matching this codebase's shared-Zod-schema
// convention for the parts Zod itself can't model (File objects, byte sizes).

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 8;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as AllowedImageMimeType)) {
    return "Only JPEG, PNG, or WebP images are allowed.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5MB or smaller.";
  }
  return null;
}

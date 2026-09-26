import { describe, expect, it, vi } from "vitest";
import { put, del } from "@vercel/blob";
import { uploadImage, deleteImageIfManaged } from "@/server/services/upload-service";

// @vercel/blob is mocked globally in vitest/setup.ts (see its comment for why a per-file vi.mock
// doesn't work reliably under isolate: false) — these are just typed handles onto that same mock
// for asserting call counts.
const putMock = vi.mocked(put);
const delMock = vi.mocked(del);

const PNG_MAGIC_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function makeFile(bytes: Uint8Array, type: string, name = "photo"): File {
  return new File([Buffer.from(bytes)], name, { type });
}

describe("uploadImage", () => {
  it("rejects a disallowed declared file type before calling Blob's put()", async () => {
    const file = makeFile(PNG_MAGIC_BYTES, "application/pdf");

    const result = await uploadImage(file, "products/seller-1");

    expect(result.ok).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects a mislabeled file whose real bytes don't match its declared type", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = makeFile(fakeBytes, "image/png");

    const result = await uploadImage(file, "products/seller-1");

    expect(result.ok).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("uploads a genuine PNG", async () => {
    const file = makeFile(PNG_MAGIC_BYTES, "image/png");

    const result = await uploadImage(file, "products/seller-1");

    expect(result.ok).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});

describe("deleteImageIfManaged", () => {
  it("deletes a URL that belongs to our own Blob store", async () => {
    await deleteImageIfManaged("https://example.public.blob.vercel-storage.com/products/seller-1/x.png");

    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it("skips a URL that isn't from our Blob store", async () => {
    await deleteImageIfManaged("https://cdn.example.com/legacy/x.png");

    expect(delMock).not.toHaveBeenCalled();
  });
});

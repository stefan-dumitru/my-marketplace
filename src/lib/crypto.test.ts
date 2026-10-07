import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

describe("secret encryption", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.CARRIER_ENCRYPTION_KEY;
    process.env.CARRIER_ENCRYPTION_KEY = KEY_A;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CARRIER_ENCRYPTION_KEY;
    else process.env.CARRIER_ENCRYPTION_KEY = original;
  });

  it("round-trips, including unicode", () => {
    for (const text of ["hunter2", "", "pässwörd-ăîșț-😀"]) {
      expect(decryptSecret(encryptSecret(text))).toBe(text);
    }
  });

  it("never stores the plaintext and uses a fresh IV each time", () => {
    const a = encryptSecret("super-secret");
    const b = encryptSecret("super-secret");
    expect(a).not.toContain("super-secret");
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", () => {
    const stored = encryptSecret("super-secret");
    const raw = Buffer.from(stored.slice("enc:v1:".length), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret("enc:v1:" + raw.toString("base64"))).toThrow();
  });

  it("cannot be decrypted with a different key", () => {
    const stored = encryptSecret("super-secret");
    process.env.CARRIER_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("refuses values that were never encrypted", () => {
    expect(() => decryptSecret("plain-text-password")).toThrow(/encrypted format/);
  });

  it("fails loudly when the key is missing or the wrong size", () => {
    delete process.env.CARRIER_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/not configured/);
    process.env.CARRIER_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});

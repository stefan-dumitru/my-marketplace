import { describe, expect, it } from "vitest";
import { addressSchema } from "@/lib/validations/checkout";

const base = {
  recipientName: "Test Recipient",
  line1: "Strada Exemplu 10",
  city: "Cluj-Napoca",
  county: "Cluj",
  postalCode: "400001",
  phone: "0723456789",
};

describe("addressSchema delivery instructions", () => {
  it("accepts an address without instructions", () => {
    expect(addressSchema.safeParse(base).success).toBe(true);
    expect(addressSchema.safeParse({ ...base, deliveryInstructions: "" }).success).toBe(true);
  });

  it("trims and keeps instructions", () => {
    const parsed = addressSchema.parse({ ...base, deliveryInstructions: "  Leave at the gate  " });
    expect(parsed.deliveryInstructions).toBe("Leave at the gate");
  });

  it("rejects instructions longer than FAN Courier's 255-character limit", () => {
    expect(addressSchema.safeParse({ ...base, deliveryInstructions: "x".repeat(256) }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, deliveryInstructions: "x".repeat(255) }).success).toBe(true);
  });
});

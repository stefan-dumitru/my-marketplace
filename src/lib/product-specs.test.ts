import { describe, expect, it } from "vitest";
import { parseSpecifications } from "@/lib/product-specs";

describe("parseSpecifications", () => {
  it("returns well-formed specifications in order, trimmed", () => {
    expect(
      parseSpecifications([
        { label: " Weight ", value: "480 g" },
        { label: "Battery", value: "20,000 mAh" },
      ])
    ).toEqual([
      { label: "Weight", value: "480 g" },
      { label: "Battery", value: "20,000 mAh" },
    ]);
  });

  it("returns an empty list for null, wrong shapes and invalid entries", () => {
    expect(parseSpecifications(null)).toEqual([]);
    expect(parseSpecifications("Weight: 480 g")).toEqual([]);
    expect(parseSpecifications([{ label: "", value: "x" }])).toEqual([]);
    expect(parseSpecifications([{ label: "Weight" }])).toEqual([]);
  });
});

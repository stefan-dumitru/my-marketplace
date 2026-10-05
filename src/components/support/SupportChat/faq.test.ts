import { describe, expect, it } from "vitest";
import { FAQ_TOPICS } from "./faq";

describe("support FAQ topics", () => {
  it("has unique ids and non-empty content", () => {
    const ids = FAQ_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of FAQ_TOPICS) {
      expect(t.question.length).toBeGreaterThan(0);
      expect(t.answer.length).toBeGreaterThan(20);
    }
  });

  it("only links to internal paths", () => {
    for (const link of FAQ_TOPICS.flatMap((t) => t.links)) {
      expect(link.href.startsWith("/")).toBe(true);
    }
  });
});

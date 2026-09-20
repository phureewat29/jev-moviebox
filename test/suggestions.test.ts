import { describe, expect, it } from "vitest";
import { COMPANY, SAID_LIMIT } from "@/core/Company";
import { SUGGESTIONS } from "@/core/Suggestions";

describe("the suggestions", () => {
  it("are short, distinct and well formed", () => {
    const seen = new Set<string>();
    for (const { said, company } of SUGGESTIONS) {
      expect(said.length, said).toBeGreaterThan(0);
      expect(said.length, said).toBeLessThanOrEqual(SAID_LIMIT);
      expect(seen.has(said.toLowerCase()), said).toBe(false);
      seen.add(said.toLowerCase());
      if (company !== null) expect(COMPANY).toContain(company);
    }
  });

  it("say who is watching about half the time", () => {
    const share = SUGGESTIONS.filter((s) => s.company !== null).length / SUGGESTIONS.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });
});

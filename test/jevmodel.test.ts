import { describe, expect, it } from "vitest";
import { renormalize } from "@/server/JevModel";

describe("renormalizing what Jev returns", () => {
  it("brings a rounded distribution back to a sum of exactly one", () => {
    const body = renormalize({
      model: "jev-1.13.0",
      answers: {
        pace: { type: "score", score: 1.2, probabilities: { "0": 0.5, "1": 0.3, "2": 0.19 }, confidence: 0.7 },
        kids: { type: "noul", noul: 0.31 },
      },
    }) as { answers: Record<string, { probabilities?: Record<string, number>; noul?: number; confidence?: number }> };
    const total = Object.values(body.answers.pace.probabilities!).reduce((sum, p) => sum + p, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    expect(body.answers.pace.probabilities!["0"]).toBeCloseTo(0.5 / 0.99, 12);
    expect(body.answers.pace.confidence).toBe(0.7);
    expect(body.answers.kids).toEqual({ type: "noul", noul: 0.31 });
  });

  it("leaves a total that is not rounding alone, so a truncated answer still fails", () => {
    const body = renormalize({
      answers: { half: { type: "choice", choice: "a", probabilities: { a: 0.3, b: 0.1 }, confidence: 1 } },
    }) as { answers: { half: { probabilities: Record<string, number> } } };
    expect(body.answers.half.probabilities).toEqual({ a: 0.3, b: 0.1 });
  });

  it("leaves a body it does not recognise alone", () => {
    expect(renormalize({ error: "bad key" })).toEqual({ error: "bad key" });
    expect(renormalize(null)).toBeNull();
    expect(renormalize({ answers: null })).toEqual({ answers: null });
  });
});

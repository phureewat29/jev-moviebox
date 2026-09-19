import { describe, expect, it } from "vitest";
import { mergeSubjects, readSubject } from "@/core/Subject";

describe("reading one subject shard", () => {
  it("weighs the answer by how much of it was not `none`, discounted by confidence", () => {
    const shard = readSubject({
      probabilities: { none: 0.1, a: 0.5, b: 0.3, c: 0.1 },
      confidence: 0.8,
    });
    expect(shard.weight).toBeCloseTo(0.9 * 0.8, 9);
    expect(shard.mass).toBeCloseTo(0.9, 9);
  });

  it("scores nothing when no film rises above what an indifferent model would spread", () => {
    // two options, so indifference is 0.5 each; a film at 0.3 carries no information
    const shard = readSubject({ probabilities: { none: 0.7, tt1: 0.3 }, confidence: 1 });
    expect(shard.scores).toEqual({});
  });

  it("is empty when the shard barely committed", () => {
    const shard = readSubject({ probabilities: { none: 0.99, tt1: 0.01 }, confidence: 1 });
    expect(shard.weight).toBe(0);
    expect(shard.mass).toBe(0);
    expect(shard.scores).toEqual({});
  });

  it("scales the leader to 1 and drops the mass an indifferent model would spread evenly", () => {
    const shard = readSubject({
      probabilities: { none: 0.1, a: 0.5, b: 0.3, c: 0.1 },
      confidence: 0.8,
    });
    expect(shard.scores.a).toBe(1);
    expect(shard.scores.b).toBeCloseTo((0.3 - 0.25) / (0.5 - 0.25), 9);
    expect(shard.scores).not.toHaveProperty("c");
    expect(shard.concentration).toBeCloseTo(0.5 / 0.9, 9);
  });
});

describe("merging shards", () => {
  it("weighs shards by mass, never by confidence", () => {
    const merged = mergeSubjects([
      { scores: { a: 1 }, weight: 0.5, concentration: 1, mass: 0.9 },
      { scores: { b: 1 }, weight: 0.7, concentration: 0.6, mass: 0.3 },
    ]);
    expect(merged.scores.a).toBe(1);
    expect(merged.scores.b).toBeCloseTo(0.3 / 0.9, 9);
    expect(merged.weight).toBe(0.7);
    expect(merged.concentration).toBe(1);
  });

  it("is empty when no shard held any of the answer", () => {
    expect(mergeSubjects([{ scores: {}, weight: 0, concentration: 0, mass: 0 }])).toEqual({
      scores: {},
      weight: 0,
      concentration: 0,
    });
  });
});

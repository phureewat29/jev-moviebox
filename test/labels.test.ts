import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Catalog, toState } from "@/core/Film";
import { Labels } from "@/core/Labels";
import { AXIS_IDS, canonicalRubric, ENDING_IDS, FILM_FACT_IDS } from "@/core/Taste";
import catalog from "@/data/catalog.json";
import labels from "@/data/labels.json";

const decoded = Schema.decodeUnknownSync(Labels)(labels);
const films = Schema.decodeUnknownSync(Catalog)(catalog);
const byId = new Map(films.map((film) => [film.id, film]));
const titleOf = (id: string) => byId.get(id)?.title ?? id;

describe("the generated labels", () => {
  it("answers the rubric that is in the tree right now", () => {
    const hash = createHash("sha256").update(canonicalRubric()).digest("hex").slice(0, 12);
    expect(
      decoded.rubricHash,
      "labels.json answers an older rubric — re-run `pnpm label`",
    ).toBe(hash);
  });

  it("records which model version answered, not the alias", () => {
    expect(decoded.model).toMatch(/^jev-\d+\.\d+/);
  });

  it("records the catalog the answers describe, so a re-fetched plot shows up as stale", () => {
    const hash = createHash("sha256")
      /** Only the fields put to the model, so an added column does not fake a stale label. */
      .update(JSON.stringify(films.map(toState)))
      .digest("hex")
      .slice(0, 12);
    expect(decoded.catalogHash, "re-run `pnpm label` after `pnpm catalog`").toBe(hash);
  });

  it("covers every title once, in catalog order", () => {
    expect(decoded.films).toHaveLength(films.length);
    expect(decoded.films.map((row) => row.id)).toEqual(films.map((film) => film.id));
  });

  it("gives every axis a distribution over its four levels", () => {
    for (const row of decoded.films) {
      for (const axis of AXIS_IDS) {
        const distribution = row.axes[axis];
        expect(distribution, `${titleOf(row.id)} ${axis}`).toHaveLength(4);
        for (const p of distribution) expect(p).toBeGreaterThanOrEqual(0);
        /**
         * Jev's own probabilities come back summing to 0.99 or 1.00, so the ranker normalizes
         * rather than trusting the total. This only guards against a shape that is far off.
         */
        const total = distribution.reduce((sum, p) => sum + p, 0);
        expect(total, `${titleOf(row.id)} ${axis}`).toBeGreaterThan(0.95);
        expect(total, `${titleOf(row.id)} ${axis}`).toBeLessThan(1.05);
      }
      expect(Object.keys(row.ending.probabilities).sort()).toEqual([...ENDING_IDS].sort());
      expect(row.ending.confidence).toBeGreaterThanOrEqual(0);
      expect(row.ending.confidence).toBeLessThanOrEqual(1);
      expect(Object.keys(row.facts).sort()).toEqual([...FILM_FACT_IDS].sort());
      for (const fact of FILM_FACT_IDS) {
        expect(row.facts[fact], `${titleOf(row.id)} ${fact}`).toBeGreaterThanOrEqual(0);
        expect(row.facts[fact], `${titleOf(row.id)} ${fact}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps probabilities at three places, so ties are ties", () => {
    for (const row of decoded.films) {
      for (const p of Object.values(row.axes).flat()) expect(p).toBe(Math.round(p * 1000) / 1000);
    }
  });
});

/**
 * The one failure in this project that would actually matter. The gate is the kids_safe Noul
 * with the rating as a backstop; these films must never reach a child, whatever their rating
 * says. M is "Passed" and Grave of the Fireflies is "Not Rated", so the rating alone is no
 * defence and the Noul has to carry it.
 */
describe("the kids gate", () => {
  const ADULT = new Set(["R", "NC-17", "X", "TV-MA"]);
  const admits = (id: string) => {
    const row = decoded.films.find((film) => film.id === id)!;
    return row.facts.kids_safe >= 0.6 && !ADULT.has(byId.get(id)!.rated);
  };
  const idOf = (title: string) => films.find((film) => film.title === title)?.id;

  it.each([
    "Come and See",
    "Grave of the Fireflies",
    "Requiem for a Dream",
    "Schindler's List",
    "M",
    "Pan's Labyrinth",
    "Oldboy",
    "Princess Mononoke",
  ])("never admits %s", (title) => {
    const id = idOf(title);
    expect(id, `${title} left the catalog; pick another`).toBeDefined();
    expect(admits(id!)).toBe(false);
  });

  it.each(["Spirited Away", "Toy Story", "My Neighbor Totoro", "The Gold Rush"])(
    "still admits %s",
    (title) => {
      const id = idOf(title);
      expect(id, `${title} left the catalog; pick another`).toBeDefined();
      expect(admits(id!)).toBe(true);
    },
  );

  it("leaves enough films to choose from", () => {
    const admitted = decoded.films.filter((row) => admits(row.id));
    expect(admitted.length).toBeGreaterThanOrEqual(30);
  });
});

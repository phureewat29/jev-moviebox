import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Cards, type FilmCard } from "@/core/Film";
import { Labels, type FilmLabels } from "@/core/Labels";
import {
  ceilingFit,
  FLOOR,
  overlap,
  rank,
  shortlist,
  type Dist,
  type PersonRead,
} from "@/core/Rank";
import { AXIS_IDS, type AxisId } from "@/core/Taste";
import cards from "@/data/films.json";
import labelsFile from "@/data/labels.json";

const films = Schema.decodeUnknownSync(Cards)(cards);
const labels = new Map(
  Schema.decodeUnknownSync(Labels)(labelsFile).films.map((row) => [row.id, row]),
);
const byTitle = (title: string) => films.find((film) => film.title === title)!;

const flat: Dist = [0.25, 0.25, 0.25, 0.25];
const at = (level: number): Dist => [0, 1, 2, 3].map((i) => (i === level ? 1 : 0));

/**
 * An axis the caller names is one the person spoke to, so it gets relevance 1. Everything else
 * gets relevance 0, which is the whole point of the gate: unspoken axes must not steer.
 */
const person = (
  axes: Partial<Record<AxisId, { probabilities: Dist; confidence: number }>>,
  extra: Partial<PersonRead> = {},
): PersonRead => ({
  axes: Object.fromEntries(
    AXIS_IDS.map((axis) => [
      axis,
      axes[axis]
        ? { ...axes[axis]!, relevance: 1 }
        : { probabilities: flat, confidence: 0, relevance: 0 },
    ]),
  ) as PersonRead["axes"],
  runtime: { probabilities: flat, confidence: 0, relevance: 0 },
  subject: { scores: {}, weight: 0, concentration: 0 },
  country: null,
  genres: [],
  genreNamed: false,
  wantsSimilar: false,
  wants: "either",
  ordering: "none",
  decade: "none",
  childrenWatching: false,
  ...extra,
});

describe("overlap", () => {
  it("is 1 for a distribution against itself", () => {
    for (const d of [at(0), at(3), flat, [0.1, 0.2, 0.3, 0.4]]) {
      expect(overlap(d, d, 4)).toBeCloseTo(1, 9);
    }
  });

  it("is 0 when they share no level", () => {
    expect(overlap(at(0), at(3), 4)).toBe(0);
  });

  it("is symmetric", () => {
    expect(overlap([0.1, 0.2, 0.3, 0.4], [0.4, 0.3, 0.2, 0.1], 4)).toBeCloseTo(
      overlap([0.4, 0.3, 0.2, 0.1], [0.1, 0.2, 0.3, 0.4], 4),
      9,
    );
  });

  it("stays within [0,1]", () => {
    for (const a of [at(0), at(1), flat, [0.7, 0.3, 0, 0]]) {
      for (const b of [at(2), at(3), flat, [0, 0, 0.5, 0.5]]) {
        const value = overlap(a, b, 4);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("normalizes, so an unscaled input scores the same", () => {
    const scaled = [0.2, 0.4, 0.6, 0.8];
    expect(overlap(scaled, flat, 4)).toBeCloseTo(overlap([0.1, 0.2, 0.3, 0.4], flat, 4), 9);
  });

  it("agrees with 1 - half the total variation", () => {
    const a = [0.1, 0.2, 0.3, 0.4];
    const b = [0.4, 0.1, 0.4, 0.1];
    const tv = 1 - 0.5 * a.reduce((sum, p, i) => sum + Math.abs(p - b[i]), 0);
    expect(overlap(a, b, 4)).toBeCloseTo(tv, 9);
  });

  it("counts mass the film puts on a level the person's answer omits", () => {
    expect(overlap([1, 0, 0, 0], [0.5, 0.5, 0, 0], 4)).toBeCloseTo(0.5, 9);
  });
});

describe("ceilingFit", () => {
  it("fully admits a film that asks for nothing, whatever the budget", () => {
    for (const budget of [at(0), at(1), at(3), flat]) {
      expect(ceilingFit(budget, at(0), 4)).toBeCloseTo(1, 9);
    }
  });

  it("admits exactly what fits inside the budget", () => {
    expect(ceilingFit(at(2), at(1), 4)).toBeCloseTo(1, 9);
    expect(ceilingFit(at(2), at(2), 4)).toBeCloseTo(1, 9);
    expect(ceilingFit(at(2), at(3), 4)).toBeCloseTo(0, 9);
  });

  it("never punishes a film for asking less, unlike overlap", () => {
    expect(ceilingFit(at(3), at(0), 4)).toBeCloseTo(1, 9);
    expect(overlap(at(3), at(0), 4)).toBe(0);
  });
});

describe("rank", () => {
  it("falls back to IMDb order when nobody has said anything", () => {
    const ranked = rank({ person: null, films, labels });
    expect(ranked).toHaveLength(films.length);
    /** Reputation is per kind, so the two lists interleave; each stays in its own order. */
    for (const kind of ["movie", "series"] as const) {
      const ranks = ranked.filter((row) => row.film.kind === kind).map((row) => row.film.imdbRank);
      expect(ranks, kind).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("is deterministic and leaves its inputs alone", () => {
    const frozen = Object.freeze([...films]);
    const once = rank({ person: null, films: frozen, labels });
    const twice = rank({ person: null, films: frozen, labels });
    expect(once.map((r) => r.film.id)).toEqual(twice.map((r) => r.film.id));
    expect(films[0].imdbRank).toBe(1);
  });

  it("does not depend on the order films arrive in", () => {
    const shuffled = [...films].reverse();
    const a = rank({ person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }), films, labels });
    const b = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }),
      films: shuffled,
      labels,
    });
    expect(a.map((r) => r.film.id)).toEqual(b.map((r) => r.film.id));
  });

  it("gives every film a finite fit in [0,1], even with a flat read", () => {
    const ranked = rank({ person: person({}), films, labels });
    for (const row of ranked) {
      expect(Number.isFinite(row.fit), row.film.title).toBe(true);
      expect(row.fit).toBeGreaterThanOrEqual(0);
      expect(row.fit).toBeLessThanOrEqual(1);
    }
  });

  it("changes nothing when an axis carries no weight", () => {
    const withZero = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0 } }),
      films,
      labels,
    });
    expect(withZero.map((r) => r.film.id)).toEqual(
      rank({ person: null, films, labels }).map((r) => r.film.id),
    );
  });

  it("drops what the person has seen or waved away", () => {
    const excluded = new Set([films[0].id, films[1].id]);
    const ranked = rank({ person: null, films, labels, excluded });
    expect(ranked).toHaveLength(films.length - 2);
    expect(ranked.some((row) => excluded.has(row.film.id))).toBe(false);
  });

  it("puts warm films on top for someone who asked for warmth", () => {
    const ranked = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }),
      films,
      labels,
    });
    const warmthOf = (id: string) => labels.get(id)!.axes.warmth[3];
    const top = ranked.slice(0, 10).reduce((sum, r) => sum + warmthOf(r.film.id), 0) / 10;
    const bottom = ranked.slice(-10).reduce((sum, r) => sum + warmthOf(r.film.id), 0) / 10;
    expect(top).toBeGreaterThan(bottom + 0.5);
  });

  it("treats attention as a budget: a recharged viewer still sees easy films", () => {
    const recharged = rank({
      person: person({ attention: { probabilities: at(3), confidence: 0.9 } }),
      films,
      labels,
    });
    const easy = byTitle("Toy Story");
    const position = recharged.findIndex((row) => row.film.id === easy.id);
    /** Proportional, so the assertion keeps its meaning as the shelf grows. */
    expect(position).toBeLessThan(films.length * 0.5);
  });

  it("locks out everything unsafe once children are watching", () => {
    const ranked = rank({ person: person({}, { childrenWatching: true }), films, labels });
    expect(ranked.length).toBeGreaterThanOrEqual(30);
    for (const row of ranked) {
      expect(["R", "NC-17", "X"], row.film.title).not.toContain(row.film.rated);
      expect(labels.get(row.film.id)!.facts.kids_safe, row.film.title).toBeGreaterThanOrEqual(0.6);
    }
    for (const title of ["Come and See", "Grave of the Fireflies", "Oldboy"]) {
      expect(ranked.some((row) => row.film.title === title), title).toBe(false);
    }
  });

  it("ignores an axis the person never raised, however sure Jev was of it", () => {
    const base = rank({ person: person({}), films, labels });
    const confidentButUnspoken = rank({
      person: person({}, {
        axes: Object.fromEntries(
          AXIS_IDS.map((axis) => [
            axis,
            { probabilities: at(0), confidence: 0.99, relevance: 0 },
          ]),
        ) as PersonRead["axes"],
      }),
      films,
      labels,
    });
    expect(confidentButUnspoken.map((r) => r.film.id)).toEqual(base.map((r) => r.film.id));
  });

  it("lets a named subject outrank mood", () => {
    const dark = byTitle("The Dark Knight");
    const ranked = rank({
      person: person(
        { warmth: { probabilities: at(3), confidence: 0.9 } },
        { subject: { scores: { [dark.id]: 1 }, weight: 0.9, concentration: 1 } },
      ),
      films,
      labels,
    });
    expect(ranked[0].film.title).toBe("The Dark Knight");
  });

  it("leaves the order alone when the query named no subject", () => {
    const moodOnly = person({ warmth: { probabilities: at(3), confidence: 0.9 } });
    const withEmptySubject = rank({
      person: { ...moodOnly, subject: { scores: {}, weight: 0, concentration: 0 } },
      films,
      labels,
    });
    expect(withEmptySubject.map((r) => r.film.id)).toEqual(
      rank({ person: moodOnly, films, labels }).map((r) => r.film.id),
    );
  });

  it("ranks 250 films fast enough to feel instant", () => {
    const read = person({ warmth: { probabilities: at(2), confidence: 0.7 } });
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) rank({ person: read, films, labels });
    expect((performance.now() - started) / 20).toBeLessThan(16);
  });
});

describe("the labels the ranker reads", () => {
  it("has one for every film the grid can show", () => {
    const missing = films.filter((film: FilmCard) => !labels.has(film.id));
    expect(missing.map((film) => film.title)).toEqual([]);
  });

  it("does not let flat labels float to the top", () => {
    const entropy = (rows: FilmLabels) =>
      Object.values(rows.axes).reduce(
        (sum, d) => sum - d.reduce((s, p) => s + (p > 0 ? p * Math.log(p) : 0), 0),
        0,
      );
    const ranked = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0.8 } }),
      films,
      labels,
    });
    const top = ranked.slice(0, 25).reduce((s, r) => s + entropy(labels.get(r.film.id)!), 0) / 25;
    const all = [...labels.values()].reduce((s, r) => s + entropy(r), 0) / labels.size;
    expect(top).toBeLessThan(all * 1.25);
  });
});

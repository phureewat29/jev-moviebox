import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Cards, type FilmCard } from "@/core/Film";
import { Labels, type FilmLabels } from "@/core/Labels";
import {
  ceilingFit,
  COUNTRY_MIN,
  MAX_RESULTS,
  overlap,
  rank,
  shortlist,
  type Dist,
  type PersonRead,
} from "@/core/Rank";
import { ADULT_RATINGS, AXIS_IDS, KIDS_SAFE_THRESHOLD, studioOf, type AxisId } from "@/core/Taste";
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
  studio: null,
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

/** A read in which nothing was said: every axis unspoken, no subject, no facet. What the app ranks on when the model has nothing. */
const silent = person({});

describe("rank", () => {
  it("falls back to IMDb order when nobody has said anything", () => {
    const ranked = rank({ person: silent, films, labels }).rows;
    expect(ranked).toHaveLength(films.length);
    /** Reputation is per kind, so the two lists interleave; each stays in its own order. */
    for (const kind of ["movie", "series"] as const) {
      const ranks = ranked.filter((row) => row.film.kind === kind).map((row) => row.film.imdbRank);
      expect(ranks, kind).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("is deterministic and leaves its inputs alone", () => {
    const frozen = Object.freeze([...films]);
    const once = rank({ person: silent, films: frozen, labels }).rows;
    const twice = rank({ person: silent, films: frozen, labels }).rows;
    expect(once.map((r) => r.film.id)).toEqual(twice.map((r) => r.film.id));
    expect(films[0].imdbRank).toBe(1);
  });

  it("does not depend on the order films arrive in", () => {
    const shuffled = [...films].reverse();
    const a = rank({ person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }), films, labels }).rows;
    const b = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }),
      films: shuffled,
      labels,
    }).rows;
    expect(a.map((r) => r.film.id)).toEqual(b.map((r) => r.film.id));
  });

  it("gives every film a finite fit in [0,1], even with a flat read", () => {
    const ranked = rank({ person: silent, films, labels }).rows;
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
    }).rows;
    expect(withZero.map((r) => r.film.id)).toEqual(
      rank({ person: silent, films, labels }).rows.map((r) => r.film.id),
    );
  });

  it("puts warm films on top for someone who asked for warmth", () => {
    const ranked = rank({
      person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }),
      films,
      labels,
    }).rows;
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
    }).rows;
    const easy = byTitle("Toy Story");
    const position = recharged.findIndex((row) => row.film.id === easy.id);
    /** Proportional, so the assertion keeps its meaning as the shelf grows. */
    expect(position).toBeLessThan(films.length * 0.5);
  });

  it("locks out everything unsafe once children are watching", () => {
    const ranked = rank({ person: person({}, { childrenWatching: true }), films, labels }).rows;
    expect(ranked.length).toBeGreaterThanOrEqual(30);
    for (const row of ranked) {
      expect(ADULT_RATINGS.has(row.film.rated), row.film.title).toBe(false);
      expect(labels.get(row.film.id)!.facts.kids_safe, row.film.title).toBeGreaterThanOrEqual(KIDS_SAFE_THRESHOLD);
    }
    for (const title of ["Come and See", "Grave of the Fireflies", "Oldboy"]) {
      expect(ranked.some((row) => row.film.title === title), title).toBe(false);
    }
  });

  it("ignores an axis the person never raised, however sure Jev was of it", () => {
    const base = rank({ person: silent, films, labels }).rows;
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
    }).rows;
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
    }).rows;
    expect(ranked[0].film.title).toBe("The Dark Knight");
  });

  it("leaves the order alone when the query named no subject", () => {
    const moodOnly = person({ warmth: { probabilities: at(3), confidence: 0.9 } });
    const withEmptySubject = rank({
      person: { ...moodOnly, subject: { scores: {}, weight: 0, concentration: 0 } },
      films,
      labels,
    }).rows;
    expect(withEmptySubject.map((r) => r.film.id)).toEqual(
      rank({ person: moodOnly, films, labels }).rows.map((r) => r.film.id),
    );
  });

  it("spreads an ordering by year across the real span, not from year zero", () => {
    const rows = rank({ person: person({}, { ordering: "newest" }), films, labels }).rows;
    const years = rows.map((row) => row.film.year);
    expect(years[0]).toBe(Math.max(...years));
    expect(years.at(-1)).toBe(Math.min(...years));
    // with only the ordering asked, match is the ordering score: the newest is 1 and the oldest 0
    expect(rows[0].match).toBeCloseTo(1, 6);
    expect(rows.at(-1)!.match).toBeCloseTo(0, 6);
    // the direction the old span collapsed: the oldest film scored 0.05 instead of 1
    const oldest = rank({ person: person({}, { ordering: "oldest" }), films, labels }).rows;
    expect(oldest[0].match).toBeCloseTo(1, 6);
  });

  it("ranks the whole catalog fast enough to feel instant", () => {
    const read = person({ warmth: { probabilities: at(2), confidence: 0.7 } });
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) rank({ person: read, films, labels });
    expect((performance.now() - started) / 20).toBeLessThan(16);
  });
});

describe("what reaches the shelf", () => {
  it("puts a title Jev named above every average, and shows it alone without a facet", () => {
    const escape = byTitle("The Great Escape");
    const toy = byTitle("Toy Story");
    const ranking = rank({
      person: person(
        { warmth: { probabilities: at(3), confidence: 0.4 } },
        { subject: { scores: { [escape.id]: 0.3, [toy.id]: 0.05 }, weight: 0.9, concentration: 1 } },
      ),
      films,
      labels,
    });
    expect(ranking.mode).toBe("named");
    expect(ranking.rows[0].film.title).toBe("The Great Escape");
    expect(ranking.rows[0].tier).toBe("named");
    expect(shortlist(ranking).map((row) => row.film.title)).toEqual(["The Great Escape"]);
  });

  it("removes the film someone wants something like, and ranks its neighbours by resemblance", () => {
    const interstellar = byTitle("Interstellar");
    const ranking = rank({
      person: person({}, { subject: { scores: { [interstellar.id]: 1 }, weight: 0.99, concentration: 1 }, wantsSimilar: true }),
      films,
      labels,
    });
    expect(ranking.rows.some((row) => row.film.id === interstellar.id)).toBe(false);
    expect(ranking.rows[0].film.title).toBe("Inception");
    expect(ranking.rows.every((row) => row.tier === "kept")).toBe(true);
  });

  it("filters on a genre only when it was stated", () => {
    const implied = rank({ person: person({}, { genres: ["Western"] }), films, labels });
    expect(implied.rows).toHaveLength(films.length);
    const stated = rank({ person: person({}, { genres: ["Western"], genreNamed: true }), films, labels });
    expect(stated.mode).toBe("browse");
    expect(stated.rows.length).toBeLessThan(20);
    for (const row of stated.rows) expect(row.film.genres, row.film.title).toContain("Western");
  });

  it("keeps the country that made the film, and falls back to any credit when there are too few", () => {
    const thai = rank({ person: person({}, { country: "Thailand" }), films, labels });
    expect(thai.mode).toBe("browse");
    for (const row of thai.rows) expect(row.film.countries[0], row.film.title).toBe("Thailand");
    const noPrimary = films.filter((film) => film.countries[0] !== "Canada");
    const canada = rank({ person: person({}, { country: "Canada" }), films: noPrimary, labels });
    expect(canada.rows.length).toBeGreaterThan(0);
    for (const row of canada.rows) expect(row.film.countries, row.film.title).toContain("Canada");
  });

  it("orders the best rated by votes as well as rating, so a niche 9.4 sits below a famous 9.3", () => {
    const rows = rank({ person: person({}, { ordering: "best_rated" }), films, labels }).rows;
    const place = (title: string) => rows.findIndex((row) => row.film.title === title);
    expect(place("The Shawshank Redemption")).toBeLessThan(place("Planet Earth II"));
    expect(place("The Shawshank Redemption")).toBeLessThan(5);
  });

  it("treats a stated length as a constraint, not a preference", () => {
    const short = person({}, { runtime: { probabilities: at(0), confidence: 0.9, relevance: 1 } });
    const ranking = rank({ person: short, films, labels });
    for (const row of ranking.rows) {
      expect(row.qualifies, row.film.title).toBe(row.film.runtime === 0 || row.film.runtime < 90);
    }
    for (const row of shortlist(ranking)) expect(row.film.runtime, row.film.title).toBeLessThan(90);
  });

  it("does not let being named excuse a stated constraint", () => {
    const dark = byTitle("The Dark Knight");
    const toy = byTitle("Toy Story");
    const ranking = rank({
      person: person(
        {},
        {
          subject: { scores: { [dark.id]: 1, [toy.id]: 0.5 }, weight: 0.9, concentration: 1 },
          runtime: { probabilities: at(0), confidence: 0.9, relevance: 1 },
        },
      ),
      films,
      labels,
    });
    expect(ranking.rows[0].film.title).toBe("The Dark Knight");
    expect(ranking.rows[0].qualifies).toBe(false);
    const shelf = shortlist(ranking);
    expect(shelf[0].film.title).toBe("Toy Story");
    expect(shelf.map((row) => row.film.title)).not.toContain("The Dark Knight");
    // the rows that fill in behind a named title are held to the same constraint
    for (const row of shelf) expect(row.qualifies, row.film.title).toBe(true);
  });

  it("does not let a narrowed shelf excuse a contradiction either", () => {
    const scared = person(
      { tension: { probabilities: at(3), confidence: 0.9 } },
      { country: "Thailand", childrenWatching: true },
    );
    const ranking = rank({ person: scared, films, labels });
    expect(ranking.mode).toBe("browse");
    expect(ranking.rows.length).toBeGreaterThan(0);
    expect(ranking.rows.every((row) => !row.qualifies)).toBe(true);
    expect(shortlist(ranking)).toEqual([]);
  });

  it("returns nothing when too little was asked to rank on", () => {
    const faint = rank({ person: person({ warmth: { probabilities: at(3), confidence: 0.7 } }), films, labels });
    expect(faint.rows.every((row) => row.match === 0)).toBe(true);
    expect(shortlist(faint)).toEqual([]);
    const spoken = rank({ person: person({ warmth: { probabilities: at(3), confidence: 0.9 } }), films, labels });
    expect(spoken.rows[0].match).toBeGreaterThan(0.9);
    // the ranked cut is relative to the leader's spread, so a denser catalog trims the tail
    expect(shortlist(spoken).length).toBeGreaterThan(MAX_RESULTS / 2);
  });

  it("prefers the primary country down to COUNTRY_MIN, then widens to any credit", () => {
    const primary = films.filter((film) => film.countries[0] === "New Zealand");
    expect(primary.length).toBeGreaterThanOrEqual(COUNTRY_MIN);
    const nz = rank({ person: person({}, { country: "New Zealand" }), films, labels });
    expect(nz.rows).toHaveLength(primary.length);
    for (const row of nz.rows) expect(row.film.countries[0], row.film.title).toBe("New Zealand");
    // take it one under the floor, and any credit starts counting
    const dropped = new Set(primary.slice(0, primary.length - COUNTRY_MIN + 1).map((film) => film.id));
    const fewer = films.filter((film) => !dropped.has(film.id));
    const loose = rank({ person: person({}, { country: "New Zealand" }), films: fewer, labels });
    expect(loose.rows.some((row) => row.film.countries[0] !== "New Zealand")).toBe(true);
  });

  it("falls back when nothing is the kind asked for, but never past a stated genre", () => {
    const movies = films.filter((film) => film.kind === "movie");
    expect(rank({ person: person({}, { wants: "series" }), films: movies, labels }).rows).toHaveLength(
      movies.length,
    );
    /**
     * A shelf where every Korean comedy is a series and every Korean film is something else.
     * Asking for a Korean comedy film has to come back empty: the kind may give way, but not
     * far enough to hand back the films that are not comedies.
     */
    const korean = (pick: (film: FilmCard) => boolean) =>
      films.filter((film) => film.countries.includes("South Korea") && pick(film));
    const shelf = [
      ...korean((film) => film.kind === "series" && film.genres.includes("Comedy")),
      ...korean((film) => film.kind === "movie" && !film.genres.includes("Comedy")),
    ];
    expect(shelf.some((film) => film.kind === "movie")).toBe(true);
    const asked = rank({
      person: person({}, { country: "South Korea", genres: ["Comedy"], genreNamed: true, wants: "movie" }),
      films: shelf,
      labels,
    });
    expect(asked.rows).toEqual([]);
  });

  it("a stated studio filters the shelf and never falls back", () => {
    const netflix = rank({ person: person({}, { studio: "Netflix" }), films, labels });
    expect(netflix.rows.length).toBeGreaterThan(50);
    for (const row of netflix.rows) expect(studioOf(row.film.studio), row.film.title).toBe("Netflix");
    expect(netflix.mode).toBe("browse");
    // GTH is GDH's earlier name, so both spellings land on one shelf
    expect(rank({ person: person({}, { studio: "GDH" }), films, labels }).rows.length).toBeGreaterThanOrEqual(30);
    // a French shelf holds no Nadao title, and the studio does not give way to find one
    expect(rank({ person: person({}, { studio: "Nadao Bangkok", country: "France" }), films, labels }).rows).toEqual([]);
  });

  it("narrows to a decade and browses it", () => {
    const ranking = rank({ person: person({}, { decade: "1920s" }), films, labels });
    expect(ranking.mode).toBe("browse");
    const twenties = films.filter((film) => film.year >= 1920 && film.year < 1930);
    expect(ranking.rows.map((row) => row.film.id).sort()).toEqual(twenties.map((film) => film.id).sort());
  });

  it("comes back empty for a contradiction, never with the least-bad thing in stock", () => {
    const scared = person(
      { tension: { probabilities: at(3), confidence: 0.9 } },
      { childrenWatching: true },
    );
    expect(shortlist(rank({ person: scared, films, labels }))).toEqual([]);
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
    }).rows;
    const top = ranked.slice(0, 25).reduce((s, r) => s + entropy(labels.get(r.film.id)!), 0) / 25;
    const all = [...labels.values()].reduce((s, r) => s + entropy(r), 0) / labels.size;
    expect(top).toBeLessThan(all * 1.25);
  });
});

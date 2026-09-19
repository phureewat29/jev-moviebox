import type { Decision } from "effect/unstable/ai";
import { describe, expect, it } from "vitest";
import { filmDecision, personDecision, SHARD_SIZE, subjectShards } from "@/core/Decisions";
import {
  AXES,
  AXIS_IDS,
  canonicalRubric,
  ENDING_IDS,
  FILM_FACT_IDS,
  FILM_STATE_FIELDS,
  GENRES,
  PERSON_SIGNAL_IDS,
  PERSON_SIGNALS,
  RUNTIME_LEVELS,
  runtimeBand,
  type AxisId,
} from "@/core/Taste";

/**
 * A level tuple is load-bearing: written as `string[]`, a rate answer's probabilities would be
 * keyed by `string` and the ranker would lose the shape it indexes by. This fails to compile if
 * that ever regresses.
 */
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Levels = (typeof AXES)[AxisId]["levels"][number];
type Attention = Decision.Answer<(typeof filmDecision)["decisions"]["attention"]>["probabilities"];
export type _LevelKeysStayLiteral = Assert<Same<keyof Attention, Levels>>;

const person = personDecision(subjectShards([])).decisions;

describe("the rubric", () => {
  it("describes every axis on four levels, for both sides", () => {
    expect(AXIS_IDS.length).toBe(10);
    for (const id of AXIS_IDS) {
      const axis = AXES[id];
      expect(axis.levels, id).toHaveLength(4);
      expect(new Set(axis.levels).size, id).toBe(4);
      expect(axis.film, id).not.toBe(axis.person);
      for (const level of axis.levels) expect(level.length, `${id} level`).toBeGreaterThan(20);
    }
  });

  it("asks the film what it is and the person what they want", () => {
    for (const id of AXIS_IDS) {
      expect(AXES[id].film, id).toMatch(/\bthis film\b/);
      expect(AXES[id].person, id).toMatch(/\bthis person\b/);
    }
  });

  it("marks the axes that are a budget rather than a target", () => {
    const ceilings = AXIS_IDS.filter((id) => AXES[id].kind === "ceiling");
    expect(ceilings).toEqual(["attention", "darkness"]);
  });

  it("puts the runtime bands in code, never a number in front of Jev", () => {
    expect(RUNTIME_LEVELS).toHaveLength(4);
    expect([89, 90, 119, 120, 149, 150, 238].map(runtimeBand)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    for (const id of AXIS_IDS) {
      expect(AXES[id].film, id).not.toMatch(/\d/);
      expect(AXES[id].person, id).not.toMatch(/\d/);
    }
  });

  it("scopes the reference question to what the person said", () => {
    expect(PERSON_SIGNALS.names_reference.instructions).toMatch(/`said`/);
    expect(PERSON_SIGNALS.names_reference.criteria.false).toMatch(/`said`/);
  });

  it("puts every word that reaches the model about a film into the hashed text", () => {
    const canonical = canonicalRubric();
    expect(canonicalRubric()).toBe(canonical);
    for (const id of AXIS_IDS) {
      expect(canonical, `${id} instructions`).toContain(AXES[id].film);
      expect(canonical, `${id} instructions`).toContain(AXES[id].person);
      for (const level of AXES[id].levels) expect(canonical, `${id} level`).toContain(level);
    }
    for (const id of ENDING_IDS) expect(canonical).toContain(id);
    for (const id of FILM_FACT_IDS) expect(canonical).toContain(id);
    // person signals are only ever asked about a person, so adding one must not mark film labels stale
    for (const id of PERSON_SIGNAL_IDS) expect(canonical).not.toContain(id);
    for (const field of FILM_STATE_FIELDS) expect(canonical).toContain(field);
  });
});

describe("the decisions put to Jev", () => {
  it("asks a film for every axis, its ending, and every fact, in one definition", () => {
    const decisions = filmDecision.decisions;
    expect(Object.keys(decisions)).toHaveLength(AXIS_IDS.length + 1 + FILM_FACT_IDS.length);
    for (const id of AXIS_IDS) {
      expect(decisions[id]._tag, id).toBe("Rate");
      expect(decisions[id].criteria, id).toHaveLength(4);
    }
    expect(decisions.ending._tag).toBe("Classify");
    expect(Object.keys(decisions.ending.criteria)).toEqual([...ENDING_IDS]);
    for (const id of FILM_FACT_IDS) expect(decisions[id]._tag, id).toBe("Probability");
  });

  it("asks a person for every axis with its relevance, the runtime, the shelf questions and the signals", () => {
    // ten axes and runtime, each with a relevance noul; a noul per genre; the signals;
    // and four questions about the shelf rather than a title: film-or-series, country, ordering, decade
    expect(Object.keys(person)).toHaveLength(
      (AXIS_IDS.length + 1) * 2 + GENRES.length + 5 + PERSON_SIGNAL_IDS.length,
    );
    for (const id of AXIS_IDS) {
      expect(person[id]._tag, id).toBe("Rate");
      expect(person[`relevance_${id}`]._tag, id).toBe("Probability");
    }
    expect(person.runtime._tag).toBe("Rate");
    for (const id of PERSON_SIGNAL_IDS) expect(person[id]._tag, id).toBe("Probability");
    for (const genre of GENRES) expect(person[`genre_${genre}`]._tag, genre).toBe("Probability");
  });

  it("keys a subject shard by imdb id and leaves room to decline", () => {
    const shards = subjectShards([
      {
        id: "tt0816692",
        kind: "movie",
        title: "Interstellar",
        year: 2014,
        plot: "A team travels through a wormhole. They look for a new home.",
      },
    ]);
    const shard = shards.subject_movie_0;
    expect(shard.criteria.tt0816692).toBe("Interstellar (2014) — A team travels through a wormhole.");
    expect(shard.criteria).toHaveProperty("none");
  });

  it("splits a kind into shards that each stay inside the 255-option ceiling", () => {
    const films = Array.from({ length: SHARD_SIZE + 1 }, (_, i) => ({
      id: `tt${i}`,
      kind: "movie" as const,
      title: `Film ${i}`,
      year: 2000,
      plot: "Something happens.",
    }));
    const shards = subjectShards(films);
    expect(Object.keys(shards)).toEqual(["subject_movie_0", "subject_movie_1"]);
    for (const shard of Object.values(shards)) {
      expect(Object.keys(shard.criteria).length).toBeLessThanOrEqual(255);
    }
  });
});

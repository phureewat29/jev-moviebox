import type { ResultFor } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { filmQuestions, personQuestions, subjectQuestion } from "@/core/Questions";
import {
  AXES,
  AXIS_IDS,
  GENRES,
  canonicalRubric,
  FILM_STATE_FIELDS,
  ENDING_IDS,
  FILM_FACT_IDS,
  PERSON_SIGNAL_IDS,
  RUNTIME_LEVELS,
  runtimeBand,
} from "@/core/Taste";

/**
 * A score's level tuple is load-bearing: written as `string[]` instead of a fixed tuple, the
 * SDK widens `probabilities` from `"0" | "1" | "2" | "3"` to `number` and the ranker quietly
 * loses the shape it indexes by. These two lines fail to compile if that ever regresses.
 */
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AttentionLevels = keyof ResultFor<ReturnType<typeof personQuestions>["attention"]>["probabilities"];
export type _LevelKeysStayLiteral = Assert<Same<AttentionLevels, "0" | "1" | "2" | "3">>;

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

  it("scopes the reference question to what the person said, not what they tapped", () => {
    const criteria = PERSON_SIGNALS_REFERENCE_CRITERIA();
    expect(criteria.false).toMatch(/loved/);
    expect(criteria.false).toMatch(/tapped/);
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
    /**
     * Person signals are deliberately absent. They are only ever asked about a person, so adding
     * one must not mark five hundred film labels stale and force a re-run that would return the
     * same answers.
     */
    for (const id of PERSON_SIGNAL_IDS) expect(canonical).not.toContain(id);
    /** The fields sent as state invalidate a label as surely as a reworded level. */
    for (const field of FILM_STATE_FIELDS) expect(canonical).toContain(field);
  });
});

const PERSON_SIGNALS_REFERENCE_CRITERIA = () => {
  const question = personQuestions().names_reference;
  const criteria = question.criteria as { true: string; false: string };
  return criteria;
};

describe("the questions put to Jev", () => {
  it("asks a film for every axis, its ending, and every fact, in one request", () => {
    const questions = filmQuestions();
    expect(Object.keys(questions)).toHaveLength(AXIS_IDS.length + 1 + FILM_FACT_IDS.length);
    for (const id of AXIS_IDS) {
      expect(questions[id].type, id).toBe("score");
      expect(questions[id].criteria, id).toHaveLength(4);
    }
    expect(questions.ending.type).toBe("choice");
    expect(Object.keys(questions.ending.criteria)).toEqual([...ENDING_IDS]);
    for (const id of FILM_FACT_IDS) expect(questions[id].type, id).toBe("noul");
  });

  it("asks a person for every axis, an ending, a runtime and the two signals", () => {
    const questions = personQuestions();
    /**
     * Every axis and runtime, each with a relevance noul; a noul per genre; the two signals;
     * and five questions about the shelf rather than a title: ending, film-or-series, country,
     * ordering, decade.
     */
    expect(Object.keys(questions)).toHaveLength(
      (AXIS_IDS.length + 1) * 2 + GENRES.length + 5 + PERSON_SIGNAL_IDS.length,
    );
    for (const id of AXIS_IDS) expect(questions[id].type, id).toBe("score");
    expect(questions.runtime.type).toBe("score");
    for (const id of PERSON_SIGNAL_IDS) expect(questions[id].type, id).toBe("noul");
  });

  it("keys the subject choice by imdb id and leaves room to decline", () => {
    const question = subjectQuestion("movie", [
      { id: "tt0816692", title: "Interstellar", year: 2014, plot: "A team travels through a wormhole. They look for a new home." },
    ]);
    expect((question.criteria as Record<string, string>).tt0816692).toBe(
      "Interstellar (2014) — A team travels through a wormhole.",
    );
    expect(question.criteria).toHaveProperty("none");
  });

  it("stays inside the 255-option ceiling on a full pool", () => {
    const films = Array.from({ length: 254 }, (_, i) => ({
      id: `tt${i}`,
      title: `Film ${i}`,
      year: 2000,
      plot: "Something happens.",
    }));
    expect(Object.keys(subjectQuestion("movie", films).criteria).length).toBeLessThanOrEqual(255);
  });

  it("asks one noul per genre, because a film is several genres at once", () => {
    const questions = personQuestions();
    for (const genre of GENRES) {
      const asked = questions[`genre_${genre}` as keyof typeof questions];
      expect(asked, genre).toBeDefined();
      expect(asked.type, genre).toBe("noul");
    }
  });

  it("asks a relevance noul beside every axis", () => {
    const questions = personQuestions();
    for (const id of AXIS_IDS) {
      const relevance = questions[`relevance_${id}` as keyof typeof questions];
      expect(relevance, id).toBeDefined();
      expect(relevance.type, id).toBe("noul");
    }
  });
});

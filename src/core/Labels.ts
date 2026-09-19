import { Schema } from "effect";
import { AXIS_IDS, ENDING_IDS, FILM_FACT_IDS } from "./Taste.ts";

/**
 * What Jev said about one film. Every axis is a distribution over that axis's four levels, in
 * level order, so the ranker can lay a person's distribution straight on top of it.
 *
 * Schema only, and no node imports, so the browser could decode this file.
 */

const Distribution = Schema.Array(Schema.Number);

/** One schema per key of a closed list, so the struct's type follows the rubric's ids. */
const fields = <const K extends readonly string[], S extends Schema.Top>(keys: K, value: S) =>
  Schema.Struct(Object.fromEntries(keys.map((key) => [key, value])) as { readonly [P in K[number]]: S });

export const FilmLabels = Schema.Struct({
  id: Schema.String,
  axes: fields(AXIS_IDS, Distribution),
  /**
   * `plot=full` often stops before the ending, so this is the one film-side answer the model
   * may be guessing at. The confidence is stored so a reader can tell the difference.
   */
  ending: Schema.Struct({
    probabilities: fields(ENDING_IDS, Schema.Number),
    confidence: Schema.Number,
  }),
  facts: fields(FILM_FACT_IDS, Schema.Number),
});
export type FilmLabels = typeof FilmLabels.Type;

export const Labels = Schema.Struct({
  /** sha256 of `canonicalRubric()`, truncated. Labels answering an older rubric are stale. */
  rubricHash: Schema.String,
  /** The version the server actually answered with, such as `jev-1.13.0`. */
  model: Schema.String,
  /** sha256 of the catalog these answers describe. A re-fetched plot is a different question. */
  catalogHash: Schema.String,
  generatedAt: Schema.String,
  films: Schema.Array(FilmLabels),
});
export type Labels = typeof Labels.Type;

/** Probabilities are kept to three places: it halves the file and removes float noise from ties. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

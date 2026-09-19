import { Schema } from "effect";
import { AXIS_IDS, ENDING_IDS, FILM_FACT_IDS } from "./Taste.ts";

/** What Jev said about one film: per axis, a distribution over its four levels in level order. No node imports; the browser may decode this. */

const Distribution = Schema.Array(Schema.Number);

const fields = <const K extends readonly string[], S extends Schema.Top>(keys: K, value: S) =>
  Schema.Struct(Object.fromEntries(keys.map((key) => [key, value])) as { readonly [P in K[number]]: S });

export const FilmLabels = Schema.Struct({
  id: Schema.String,
  axes: fields(AXIS_IDS, Distribution),
  // `plot=full` often stops before the ending, so this is the one answer the model may be guessing at
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

/** Three places halves the file and removes float noise from ties. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

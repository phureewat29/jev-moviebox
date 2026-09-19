import { Schema } from "effect";
import { AXIS_IDS, ENDING_IDS, FILM_FACT_IDS } from "./Taste.ts";

/**
 * What Jev said about one film. Every axis is a distribution over that axis's four levels, in
 * level order, so the ranker can lay a person's distribution straight on top of it.
 *
 * Schema only, and no node imports, so the browser can decode this file. The rubric hash is
 * computed where it is written and where it is checked, never here.
 */

const Distribution = Schema.Array(Schema.Number);
const fields = <const K extends readonly string[]>(keys: K, value: Schema.Schema<number>) =>
  Schema.Struct(Object.fromEntries(keys.map((key) => [key, value])) as {
    readonly [P in K[number]]: Schema.Schema<number>;
  });

export const FilmLabels = Schema.Struct({
  id: Schema.String,
  axes: Schema.Struct(
    Object.fromEntries(AXIS_IDS.map((id) => [id, Distribution])) as {
      readonly [K in (typeof AXIS_IDS)[number]]: typeof Distribution;
    },
  ),
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
  /** The version the server actually answered with, such as `jev-1.13.0`, never the alias. */
  model: Schema.String,
  /** sha256 of the catalog these answers describe. A re-fetched plot is a different question. */
  catalogHash: Schema.String,
  datasetDate: Schema.String,
  generatedAt: Schema.String,
  films: Schema.Array(FilmLabels),
});
export type Labels = typeof Labels.Type;

/** Probabilities are kept to three places: it halves the file and removes float noise from ties. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

import { Record, Schema } from "effect";
import { Decision } from "effect/unstable/ai";
import { KINDS, type Kind } from "./Film.ts";
import {
  AXES,
  AXIS_IDS,
  COUNTRIES,
  COUNTRY_QUESTION,
  DECADES,
  DECADE_QUESTION,
  ENDINGS,
  FILM_FACTS,
  GENRES,
  genreQuestion,
  ORDERING,
  ORDERING_QUESTION,
  PERSON_SIGNALS,
  relevanceCriteria,
  relevanceInstruction,
  RUNTIME_LEVELS,
  RUNTIME_QUESTION,
  RUNTIME_RELEVANCE,
  WANTS,
  WANTS_QUESTION,
  type AxisId,
  type GenreId,
} from "./Taste.ts";

/**
 * The rubric in Taste.ts, expressed as Decisions: a Schema for the input and a record of
 * `rate`, `classify` and `probability` questions over it. One `DecisionModel.decide` answers a
 * whole record in one provider call, typed by the record, so nothing downstream casts.
 *
 * In Jev's own vocabulary a `classify` is a Choice, a `rate` a Score and a `probability` a Noul;
 * comments elsewhere use whichever reads better.
 */

/** Exactly what the model is told about a film. Hashed into the labels, so it is a Schema, not a comment. */
export const FilmState = Schema.Struct({
  film: Schema.Struct({
    title: Schema.String,
    year: Schema.Int,
    director: Schema.String,
    starring: Schema.Array(Schema.String),
    genres: Schema.Array(Schema.String),
    plot: Schema.String,
  }),
});
export type FilmState = typeof FilmState.Type;

/**
 * Only what the person typed. Putting who is watching in the state made Jev answer the situation
 * rather than the question — "scare me" with children present came back with tension relevance
 * near zero — so the audience is a filter in code, never a fact in front of the model.
 */
export const Said = Schema.Struct({ said: Schema.String });

const rateAxes = (side: "film" | "person") =>
  Record.map(AXES, (axis) => Decision.rate({ instructions: axis[side], criteria: axis.levels }));

type Relevance = { readonly [K in AxisId as `relevance_${K}`]: Decision.Probability };
const relevance = (): Relevance =>
  Object.fromEntries(
    AXIS_IDS.map((axis) => [
      `relevance_${axis}`,
      Decision.probability({ instructions: relevanceInstruction(axis), criteria: relevanceCriteria }),
    ]),
  ) as Relevance;

/** Always asked. Suppressing these once the subject had committed blanked "a western", which is both. */
type Genres = { readonly [G in GenreId as `genre_${G}`]: Decision.Probability };
const genres = (): Genres =>
  Object.fromEntries(
    GENRES.map((genre) => [`genre_${genre}`, Decision.probability(genreQuestion(genre))]),
  ) as Genres;

/** A closed set plus `none`, typed as such, so the answer's label stays a literal union. */
const withNone = <const T extends string>(
  options: readonly T[],
  describe: (option: T) => string,
  none: string,
): Record<T | "none", string> =>
  ({ ...Object.fromEntries(options.map((option) => [option, describe(option)])), none }) as Record<
    T | "none",
    string
  >;

export const filmDecision = Decision.make({
  input: FilmState,
  decisions: {
    ...rateAxes("film"),
    ending: Decision.classify({
      instructions: "How does this film leave the viewer at the end?",
      criteria: ENDINGS,
    }),
    ...Record.map(FILM_FACTS, (fact) => Decision.probability(fact)),
  },
});
export type FilmDecision = typeof filmDecision;

/** A classify decision (a Jev Choice) takes at most 255 labels, and one of them is `none`. */
export const SHARD_SIZE = 254;
export type ShardId = `subject_${Kind}_${number}`;

export type SubjectOption = {
  readonly id: string;
  readonly kind: Kind;
  readonly title: string;
  readonly year: number;
  readonly plot: string;
  readonly studio?: string | undefined;
};

const firstSentence = (plot: string) => {
  const sentence = plot.split(/(?<=\.)\s/)[0] ?? plot;
  return sentence.length > 90 ? `${sentence.slice(0, 88)}…` : sentence;
};

const NOUN: Record<Kind, { plural: string; singular: string }> = {
  movie: { plural: "films", singular: "film" },
  series: { plural: "series", singular: "series" },
};

const shard = (kind: Kind, films: readonly SubjectOption[]) =>
  Decision.classify({
    instructions: `Which of these ${NOUN[kind].plural} is this person asking for? Match on anything the person named: the subject, the theme, the story, a character, a director, an actor, a genre, a country or era, or the title itself. Ignore how the person says they feel.`,
    criteria: {
      ...Object.fromEntries(
        films.map((film) => [
          film.id,
          `${film.title} (${film.year})${film.studio === undefined ? "" : ` — ${film.studio}`} — ${firstSentence(film.plot)}`,
        ]),
      ),
      none: `No ${NOUN[kind].singular} here answers what the person named, or they described only a mood or an occasion.`,
    },
  });

/**
 * The catalog as several classify decisions of at most 254 titles, split by kind and then by
 * size, each with its own `none`. The ceiling is per decision, and every decision in a
 * definition is answered in one call, so this is how a 744-title shelf costs one round trip.
 */
export const subjectShards = (
  films: readonly SubjectOption[],
): Record<ShardId, Decision.Classify<string>> =>
  Object.fromEntries(
    KINDS.flatMap((kind) => {
      const mine = films.filter((film) => film.kind === kind);
      return Array.from({ length: Math.ceil(mine.length / SHARD_SIZE) }, (_, index) => [
        `subject_${kind}_${index}`,
        shard(kind, mine.slice(index * SHARD_SIZE, (index + 1) * SHARD_SIZE)),
      ]);
    }),
  ) as Record<ShardId, Decision.Classify<string>>;

type Shards = Record<ShardId, Decision.Classify<string>>;

/**
 * Every question about a person. The shard keys are dynamic, so the one place the record is
 * assembled says so with a type intersection; everything reading the answers is then typed by
 * the definition and nothing downstream casts.
 */
export const personDecision = (shards: Shards) => {
  const named = {
  ...rateAxes("person"),
  ...relevance(),
  runtime: Decision.rate({ instructions: RUNTIME_QUESTION, criteria: RUNTIME_LEVELS }),
  relevance_runtime: Decision.probability({
    instructions: RUNTIME_RELEVANCE,
    criteria: relevanceCriteria,
  }),
  ...Record.map(PERSON_SIGNALS, (signal) => Decision.probability(signal)),
  wants: Decision.classify({ instructions: WANTS_QUESTION, criteria: WANTS }),
  country: Decision.classify({
    instructions: COUNTRY_QUESTION,
    criteria: withNone(
      COUNTRIES,
      (country) => `Films and series from ${country}.`,
      "They named no country, language or region.",
    ),
  }),
  ...genres(),
  ordering: Decision.classify({ instructions: ORDERING_QUESTION, criteria: ORDERING }),
  decade: Decision.classify({
    instructions: DECADE_QUESTION,
    criteria: withNone(DECADES, (decade) => `Films from the ${decade}.`, "They named no decade or era."),
  }),
  };
  return Decision.make({ input: Said, decisions: { ...named, ...shards } as typeof named & Shards });
};
export type PersonDecision = ReturnType<typeof personDecision>;

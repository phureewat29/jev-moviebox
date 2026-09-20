import { Record, Schema } from "effect";
import { Decision } from "effect/unstable/ai";
import { KINDS, type Kind } from "./Film.ts";
import {
  AXES,
  AXIS_IDS,
  COUNTRIES,
  COUNTRY_QUESTION,
  STUDIOS,
  STUDIO_QUESTION,
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
} from "./Taste.ts";

/**
 * The rubric as Decisions: a Schema for the input and a record of `rate`, `classify` and
 * `probability` over it, answered whole by one `DecisionModel.decide` and typed by the record.
 * In Jev's own words a classify is a Choice, a rate a Score, a probability a Noul.
 */

/** Everything the model is told about a film; hashed into the labels. */
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

/** Only what was typed: with the audience in the state, "scare me" for children read as tension irrelevant. */
export const Said = Schema.Struct({ said: Schema.String });

/** What a Choice or a Score answer carries once the label is spent; derived from the SDK so the seam cannot drift. */
export type Distribution<L extends string = string> = Pick<Decision.ClassifyAnswer<L>, "probabilities" | "confidence">;

const rateAxes = (side: "film" | "person") =>
  Record.map(AXES, (axis) => Decision.rate({ instructions: axis[side], criteria: axis.levels }));

/** One Noul per key under a prefix; the reader indexes the answers by these keys. */
const prefixed = <P extends string, K extends string>(
  prefix: P,
  keys: readonly K[],
  ask: (key: K) => Decision.Probability,
) =>
  Object.fromEntries(keys.map((key) => [`${prefix}_${key}`, ask(key)])) as {
    readonly [Key in K as `${P}_${Key}`]: Decision.Probability;
  };

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

/** A classify takes at most 255 labels, one of them `none`. */
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
    instructions: `Which of these ${NOUN[kind].plural} is this person asking for? Match on anything the person named: the subject, the theme, the story, a character, a director, an actor, a genre, a country or era, or the title itself. Ignore how the person says they feel — a word that merely turns up in a title does not make it the answer, so a person saying how they want the evening to go has named nothing here.`,
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

/** The catalog as classify decisions of 254, split by kind then size, each with its own `none`; one call answers them all. */
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

/** The shard keys are dynamic, so the merged record is asserted; every reader of the answers is typed by the definition. */
export const personDecision = (shards: Shards) => {
  const named = {
  ...rateAxes("person"),
  ...prefixed("relevance", AXIS_IDS, (axis) =>
    Decision.probability({ instructions: relevanceInstruction(axis), criteria: relevanceCriteria }),
  ),
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
  studio: Decision.classify({
    instructions: STUDIO_QUESTION,
    criteria: withNone(STUDIOS, (studio) => `Films and series from ${studio}.`, "They named no studio or platform."),
  }),
  // always asked: suppressing these once the subject had committed blanked "a western", which is both
  ...prefixed("genre", GENRES, (genre) => Decision.probability(genreQuestion(genre))),
  ordering: Decision.classify({ instructions: ORDERING_QUESTION, criteria: ORDERING }),
  decade: Decision.classify({
    instructions: DECADE_QUESTION,
    criteria: withNone(DECADES, (decade) => (decade === "2020s" ? "Films from the 2020s — this decade, the last few years." : `Films from the ${decade}.`), "They named no decade or era."),
  }),
  };
  return Decision.make({ input: Said, decisions: { ...named, ...shards } as typeof named & Shards });
};
export type PersonDecision = ReturnType<typeof personDecision>;

/** The subject alone: one request holds 64k tokens and the shelf outgrew it, so the series ride in a second request beside the films. */
export const subjectDecision = (shards: Shards) => Decision.make({ input: Said, decisions: shards });
export type SubjectDecision = ReturnType<typeof subjectDecision>;

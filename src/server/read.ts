import { Config, Effect, Record, Schema } from "effect";
import { DecisionModel, type AiError } from "effect/unstable/ai";
import { COMPANY, SAID_LIMIT } from "../core/Company.ts";
import {
  personDecision,
  subjectShards,
  type ShardId,
  type SubjectOption,
} from "../core/Decisions.ts";
import type { PersonRead } from "../core/Rank.ts";
import { mergeSubjects, readSubject, weightOf } from "../core/Subject.ts";
import { AXES, GENRES, RUNTIME_LEVELS, type AxisId, type CountryId } from "../core/Taste.ts";

/** Caps are applied here, not in the browser, and long text is trimmed rather than refused. */
export const ReadRequest = Schema.Struct({
  said: Schema.String.check(Schema.isMaxLength(4000)),
  company: Schema.NullOr(Schema.Literals(COMPANY)),
});
export type ReadRequest = typeof ReadRequest.Type;

/**
 * Gates. A classify answer counts only above a confidence, and `none` is the absence of an
 * answer. The country is gated on its own mass against `none` instead: confidence is confidence
 * in the argmax, and when the argmax is `none` it reads as certainty about the opposite.
 */
const CONFIDENCE = { wants: 0.75, ordering: 0.4, decade: 0.4 } as const;
const COUNTRY_RATIO = 0.5;
const GENRE_THRESHOLD = 0.45;
const SIGNAL = 0.5;

type Classified<L extends string> = {
  readonly label: L;
  readonly probabilities: Readonly<Record<L, number>>;
  readonly confidence?: number | undefined;
};

const distribution = <L extends string>(
  answer: { readonly probabilities: Readonly<Record<L, number>> },
  levels: readonly L[],
) => levels.map((level) => answer.probabilities[level] ?? 0);

/** A missing confidence here means the answer cannot be trusted, so the gate falls back. */
const gated = <L extends string, F extends L>(answer: Classified<L>, min: number, fallback: F) =>
  answer.label === fallback || (answer.confidence ?? 0) < min ? fallback : answer.label;

const countryOf = (answer: Classified<CountryId | "none">): CountryId | null => {
  if (answer.label === "none") return null;
  const mine = answer.probabilities[answer.label];
  const none = answer.probabilities.none;
  return mine / Math.max(1e-9, mine + none) >= COUNTRY_RATIO ? answer.label : null;
};

const isShard = (key: string): key is ShardId => key.startsWith("subject_");

/**
 * The catalog is supplied rather than imported, so this module stays free of data files and a
 * script can point it at a fixture. The definition is built once: it carries every title.
 */
export const makeReader = (films: readonly SubjectOption[]) => {
  const definition = personDecision(subjectShards(films));
  const shardIds = Object.keys(definition.decisions).filter(isShard);

  return (request: ReadRequest) =>
    Effect.gen(function* () {
      const { answers } = yield* DecisionModel.decide(definition, {
        input: { said: request.said.trim().slice(0, SAID_LIMIT) },
      });

      const axis = (id: AxisId) => ({
        probabilities: distribution(answers[id], AXES[id].levels),
        confidence: weightOf(answers[id]),
        relevance: answers[`relevance_${id}`].probability,
      });

      return {
        axes: Record.map(AXES, (_axis, id) => axis(id)),
        runtime: {
          probabilities: distribution(answers.runtime, RUNTIME_LEVELS),
          confidence: weightOf(answers.runtime),
          relevance: answers.relevance_runtime.probability,
        },
        subject: mergeSubjects(shardIds.map((id) => readSubject(answers[id]))),
        // "a prestige tv drama" means series; "anime" means neither, and a guess there cuts half the right answers
        wants: gated(answers.wants, CONFIDENCE.wants, "either"),
        country: countryOf(answers.country),
        genres: GENRES.filter((genre) => answers[`genre_${genre}`].probability > GENRE_THRESHOLD),
        // a stated genre is a requirement; an inferred one only a preference
        genreNamed: answers.genre_named.probability > SIGNAL,
        wantsSimilar: answers.names_reference.probability > SIGNAL,
        ordering: gated(answers.ordering, CONFIDENCE.ordering, "none"),
        decade: gated(answers.decade, CONFIDENCE.decade, "none"),
        // an audience chosen by hand decides in both directions; the text only speaks when nobody said who is here
        childrenWatching:
          request.company === null
            ? answers.children_watching.probability > SIGNAL
            : request.company === "kids",
      } satisfies PersonRead;
    });
};

/**
 * One budget for the whole read. The page shows an empty shelf either way, so it wants an answer
 * or null, never an error — but every failure is logged first, because `DecisionModel` now
 * validates each answer and a rejected distribution must not vanish without a trace.
 */
const BUDGET_MS = Config.Int("TYPESAFE_TIMEOUT_MS").pipe(Config.withDefault(12_000));

export const readOrNull = (
  read: (request: ReadRequest) => Effect.Effect<PersonRead, AiError.AiError, DecisionModel.DecisionModel>,
  request: ReadRequest,
) =>
  Effect.gen(function* () {
    const budget = yield* BUDGET_MS;
    return yield* read(request).pipe(
      Effect.timeoutOrElse({ duration: `${budget} millis`, orElse: () => Effect.succeed(null) }),
    );
  }).pipe(
    Effect.tapError((error) => Effect.logError(error)),
    Effect.orElseSucceed(() => null),
  );

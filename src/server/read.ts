import { Config, Effect, Record, Schema } from "effect";
import { DecisionModel, type AiError } from "effect/unstable/ai";
import { COMPANY, SAID_LIMIT } from "../core/Company.ts";
import {
  personDecision,
  subjectDecision,
  subjectShards,
  type ShardId,
  type SubjectOption,
} from "../core/Decisions.ts";
import type { Kind } from "../core/Film.ts";
import type { PersonRead } from "../core/Rank.ts";
import { mergeSubjects, readSubject, weightOf } from "../core/Subject.ts";
import { AXES, GENRES, RUNTIME_LEVELS, type AxisId } from "../core/Taste.ts";

export const ReadRequest = Schema.Struct({
  said: Schema.String.check(Schema.isMaxLength(4000)),
  company: Schema.NullOr(Schema.Literals(COMPANY)),
});
export type ReadRequest = typeof ReadRequest.Type;

/** Country is gated on its own mass against `none`: confidence is confidence in the argmax, and an argmax of `none` reads as certainty about the opposite. */
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

/** Here a missing confidence means the answer cannot be trusted, so the gate falls back. */
const gated = <L extends string, F extends L>(answer: Classified<L>, min: number, fallback: F) =>
  answer.label === fallback || (answer.confidence ?? 0) < min ? fallback : answer.label;

/** A named option counts only on its own mass against `none`, for country and studio alike. */
const namedOf = <L extends string>(answer: Classified<L | "none">): L | null => {
  if (answer.label === "none") return null;
  const mine = answer.probabilities[answer.label];
  const none = answer.probabilities.none;
  return mine / Math.max(1e-9, mine + none) >= COUNTRY_RATIO ? answer.label : null;
};

const isShard = (key: string): key is ShardId => key.startsWith("subject_");

/** The catalog is supplied so a script can point this at a fixture. Two definitions, built once: one request holds 64k tokens. */
export const makeReader = (films: readonly SubjectOption[]) => {
  const shardsOf = (kind: Kind) => subjectShards(films.filter((film) => film.kind === kind));
  const asked = personDecision(shardsOf("movie"));
  const rest = subjectDecision(shardsOf("series"));
  const shardIds = [...Object.keys(asked.decisions), ...Object.keys(rest.decisions)].filter(isShard);

  return (request: ReadRequest) =>
    Effect.gen(function* () {
      const input = { said: request.said.trim().slice(0, SAID_LIMIT) };
      const [film, series] = yield* Effect.all(
        [DecisionModel.decide(asked, { input }), DecisionModel.decide(rest, { input })],
        { concurrency: "unbounded" },
      );
      const answers = { ...film.answers, ...series.answers };

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
        // "anime" means neither film nor series; a guess there cuts half the right answers
        wants: gated(answers.wants, CONFIDENCE.wants, "either"),
        country: namedOf(answers.country),
        studio: namedOf(answers.studio),
        // strongest first, so a filter that has to give ground drops the least certain genre
        genres: GENRES.filter((genre) => answers[`genre_${genre}`].probability > GENRE_THRESHOLD).sort(
          (a, b) => answers[`genre_${b}`].probability - answers[`genre_${a}`].probability,
        ),
        genreNamed: answers.genre_named.probability > SIGNAL,
        wantsSimilar: answers.names_reference.probability > SIGNAL,
        ordering: gated(answers.ordering, CONFIDENCE.ordering, "none"),
        decade: gated(answers.decade, CONFIDENCE.decade, "none"),
        // a hand-picked audience decides both ways; the text speaks only when nobody said who is here
        childrenWatching:
          request.company === null
            ? answers.children_watching.probability > SIGNAL
            : request.company === "kids",
      } satisfies PersonRead;
    });
};

/** The page wants an answer or null, never an error; every failure is logged first, so a rejected answer leaves a trace. */
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

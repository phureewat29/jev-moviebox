import { Effect, Record, Schema } from "effect";
import { Jev } from "../core/Jev.ts";
import { personQuestions, subjectQuestions } from "../core/Questions.ts";
import type { PersonRead, Subject } from "../core/Rank.ts";
import {
  AXES,
  GENRES,
  type CountryId,
  type DecadeId,
  type GenreId,
  type OrderingId,
  type WantsId,
} from "../core/Taste.ts";

export const COMPANY = ["solo", "couple", "friends", "family", "kids"] as const;
export type Company = (typeof COMPANY)[number];

/** Caps are applied here, not in the browser, and long text is trimmed rather than refused. */
export const ReadRequest = Schema.Struct({
  said: Schema.String.pipe(Schema.maxLength(4000)),
  /** Nothing selected means no constraint: the shelf is open to everything. */
  company: Schema.NullOr(Schema.Literal(...COMPANY)),
});
export type ReadRequest = typeof ReadRequest.Type;

export const SAID_LIMIT = 200;

/**
 * Gated on how the country's own mass compares with `none`, not on the Choice's confidence —
 * confidence is confidence in the argmax, and when the argmax is `none` it reads as certainty
 * about the opposite. The same ratio idiom `readSubject` already uses.
 */
const COUNTRY_RATIO = 0.5;
const GENRE_THRESHOLD = 0.45;

type ScoreAnswer = { readonly probabilities: Record<string, number>; readonly confidence: number };
type Answers = Record<string, ScoreAnswer & { readonly noul?: number }>;

const distribution = (answer: ScoreAnswer) =>
  Object.keys(answer.probabilities)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => answer.probabilities[String(level)]);

/**
 * `none` is how much of the query was not about subject at all, so one minus it is the weight,
 * and the film probabilities renormalised against it are the ranking. Read as a distribution,
 * never as an argmax: a diffuse query like "friendship" peaks at only 0.39 and is still right.
 */
const readSubject = (answer: {
  probabilities: Record<string, number>;
  confidence: number;
}): Subject & { readonly mass: number } => {
  const none = answer.probabilities.none ?? 0;
  const films = Object.entries(answer.probabilities)
    .filter(([id]) => id !== "none")
    .sort((a, b) => b[1] - a[1]);
  /** How much of the answer landed in this shard at all. What the merge weighs shards by. */
  const mass = 1 - none;
  if (films.length === 0) return { scores: {}, weight: 0, concentration: 0, mass: 0 };

  const topThree = films.slice(0, 3).reduce((sum, [, p]) => sum + p, 0);
  const weight = (topThree / Math.max(1e-9, topThree + none)) * answer.confidence;
  if (weight <= 0.02) return { scores: {}, weight: 0, concentration: 0, mass: 0 };

  /** The mass an indifferent model would spread evenly carries no information, so remove it. */
  const floor = 1 / (films.length + 1);
  const span = Math.max(1e-9, films[0][1] - floor);
  const scores = Object.fromEntries(
    films
      .map(([id, p]) => [id, Math.max(0, p - floor) / span] as const)
      .filter(([, value]) => value > 0),
  );
  const filmMass = films.reduce((sum, [, p]) => sum + p, 0);
  return { scores, weight, concentration: filmMass > 0 ? films[0][1] / filmMass : 0, mass };
};

/**
 * Several shards, several answers. Each shard was asked the same question about a different
 * slice of the shelf, and each says through its own `none` how much of the answer landed in it.
 * That mass is the only quantity comparable across shards — it is measured against the same
 * question — so the scores are scaled by it and nothing else.
 *
 * Scaling by the shards' confidence instead was the old bug: confidence describes how peaked a
 * distribution is, not how much of the answer it holds, so a shard that confidently held
 * nothing could outrank one that held the right title.
 */
const mergeSubjects = (shards: readonly (Subject & { mass: number })[]): Subject => {
  const strongest = shards.reduce(
    (best, shard) => (shard.mass > best.mass ? shard : best),
    { scores: {}, weight: 0, concentration: 0, mass: 0 } as Subject & { mass: number },
  );
  if (strongest.mass <= 0) return { scores: {}, weight: 0, concentration: 0 };
  return {
    scores: Object.fromEntries(
      shards.flatMap((shard) =>
        Object.entries(shard.scores).map(
          ([id, value]) => [id, value * (shard.mass / strongest.mass)] as const,
        ),
      ),
    ),
    weight: Math.max(...shards.map((shard) => shard.weight)),
    concentration: strongest.concentration,
  };
};

export type SubjectFilm = {
  id: string;
  kind: "movie" | "series";
  title: string;
  year: number;
  plot: string;
  studio?: string | undefined;
};

/**
 * The catalog is supplied rather than imported, so this module stays free of data files and a
 * script can point it at a fixture. The Choice it builds carries all 250 films, which makes it
 * far too expensive to rebuild per request — hence a reader built once and reused.
 */
export const makeReader = (films: readonly SubjectFilm[]) => {
  const subjects = subjectQuestions(films);
  const subjectIds = Object.keys(subjects);
  return (request: ReadRequest) =>
    Effect.gen(function* () {
      const jev = yield* Jev;
      const said = request.said.trim().slice(0, SAID_LIMIT);
      /**
       * Only what the person typed. Putting the company in the state made Jev answer the
       * situation rather than the question: "scare me" with `watching_with: "kids"` came back
       * with tension relevance near zero, because the model softened a request it read as
       * unsuitable. Who is watching is a filter, and filters belong in code.
       */
      const { answers } = yield* jev.ask({
        state: { said },
        questions: { ...personQuestions(), ...subjects },
      });

      const countryOf = (answer: {
        choice: CountryId | "none";
        probabilities: Record<string, number>;
      }) => {
        if (answer.choice === "none") return null;
        const mine = answer.probabilities[answer.choice] ?? 0;
        const none = answer.probabilities.none ?? 0;
        return mine / Math.max(1e-9, mine + none) >= COUNTRY_RATIO ? answer.choice : null;
      };

      const read = answers as unknown as Answers & {
        children_watching: { noul: number };
        [shard: string]: unknown;
        wants: { choice: WantsId; confidence: number };
        country: { choice: CountryId | "none"; probabilities: Record<string, number> };
        ordering: { choice: OrderingId; confidence: number };
        decade: { choice: DecadeId; confidence: number };
      };
      const subject = mergeSubjects(
        subjectIds.map((id) =>
          readSubject(read[id] as { probabilities: Record<string, number>; confidence: number }),
        ),
      );
      const axis = (key: string, relevance: number) => ({
        probabilities: distribution(read[key]),
        confidence: read[key].confidence,
        relevance,
      });

      return {
        axes: Record.map(AXES, (_axis, id) => axis(id, read[`relevance_${id}`].noul ?? 0)),
        runtime: axis("runtime", read.relevance_runtime.noul ?? 0),
        subject,
        /**
         * Only when they plainly said so. "A prestige tv drama" means series; "anime" means
         * neither, and filtering on a guess there cuts half the right answers.
         */
        wants:
          read.wants.choice === "either" || read.wants.confidence < 0.75
            ? "either"
            : read.wants.choice,
        /**
         * A named country is a filter over data we already hold. Gated on confidence, because
         * filtering the shelf down on a guess is far worse than not filtering at all.
         */
        country: countryOf(read.country),
        /**
         * Always asked. Suppressing the battery whenever the subject Choice had committed cost
         * more than it saved: "a western" is both a committed subject answer and a genre, so
         * the suppression blanked the genre and the shelf came back with two titles.
         */
        genres: GENRES.filter((genre) => (read[`genre_${genre}`]?.noul ?? 0) > GENRE_THRESHOLD),
        /**
         * Whether those genres may filter. A stated genre is a requirement; an inferred one is
         * only a preference, because inferring Crime from "jail breaking" and filtering on it
         * dropped the right answer.
         */
        genreNamed: (read.genre_named?.noul ?? 0) > 0.5,
        /** "Something like Interstellar" wants Interstellar's neighbours, not Interstellar. */
        wantsSimilar: (read.names_reference?.noul ?? 0) > 0.5,
        /** A request to sort rather than to match. Code does the sorting; Jev only names it. */
        ordering:
          read.ordering.choice === "none" || read.ordering.confidence < 0.4
            ? "none"
            : read.ordering.choice,
        decade:
          read.decade.choice === "none" || read.decade.confidence < 0.4 ? "none" : read.decade.choice,
        /**
         * An audience chosen by hand decides, in both directions. Reading the text instead
         * meant that once a suggestion mentioned children the gate stuck on, and clearing the
         * audience could not shift it. The Noul only speaks when nobody has said who is here.
         */
        childrenWatching:
          request.company === null
            ? read.children_watching.noul > 0.5
            : request.company === "kids",
      } satisfies PersonRead;
    });
};

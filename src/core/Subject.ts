import type { Subject } from "./Rank.ts";

/**
 * Turning the subject shards into one `Subject`. Pure arithmetic over answers, kept apart from
 * the reader so it can be tested with numbers rather than with a model.
 */

export type Shard = Subject & {
  /** How much of the answer landed in this shard at all: one minus its `none`. */
  readonly mass: number;
};

const EMPTY: Shard = { scores: {}, weight: 0, concentration: 0, mass: 0 };

/**
 * A missing confidence *as a weight* means unweighted, not worthless: `?? 0` would silently
 * zero every axis and the whole topical signal for a provider that simply reports none.
 */
export const weightOf = (answer: { readonly confidence?: number | undefined }) => answer.confidence ?? 1;

/**
 * `none` is how much of the query was not about subject at all. The top three carry the
 * weight because a franchise splits its mass across its films and is still a committed answer.
 * Read as a distribution, never as an argmax: "friendship" peaks at 0.39 and is still right.
 */
export const readSubject = (answer: {
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence?: number | undefined;
}): Shard => {
  const none = answer.probabilities.none ?? 0;
  const films = Object.entries(answer.probabilities)
    .filter(([id]) => id !== "none")
    .sort((a, b) => b[1] - a[1]);
  if (films.length === 0) return EMPTY;

  const topThree = films.slice(0, 3).reduce((sum, [, p]) => sum + p, 0);
  const weight = (topThree / Math.max(1e-9, topThree + none)) * weightOf(answer);
  if (weight <= 0.02) return EMPTY;

  // the mass an indifferent model would spread evenly carries no information
  const floor = 1 / (films.length + 1);
  const span = Math.max(1e-9, films[0][1] - floor);
  const scores = Object.fromEntries(
    films
      .map(([id, p]) => [id, Math.max(0, p - floor) / span] as const)
      .filter(([, value]) => value > 0),
  );
  const filmMass = films.reduce((sum, [, p]) => sum + p, 0);
  return {
    scores,
    weight,
    concentration: filmMass > 0 ? films[0][1] / filmMass : 0,
    mass: 1 - none,
  };
};

/**
 * Shards are weighed by mass and nothing else. Every shard was asked the same question, so
 * `1 - none` is the one quantity comparable across them; confidence describes how peaked a
 * distribution is, not how much of the answer it holds, and merging on it once let a shard
 * that confidently held nothing outrank the one holding the right title.
 */
export const mergeSubjects = (shards: readonly Shard[]): Subject => {
  const strongest = shards.reduce((best, shard) => (shard.mass > best.mass ? shard : best), EMPTY);
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

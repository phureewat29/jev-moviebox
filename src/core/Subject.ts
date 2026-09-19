import type { Subject } from "./Rank.ts";

/** The subject shards folded into one `Subject`: pure arithmetic, tested with numbers rather than a model. */

export type Shard = Subject & {
  /** One minus the shard's `none`: how much of the answer landed in it. */
  readonly mass: number;
};

const EMPTY: Shard = { scores: {}, weight: 0, concentration: 0, mass: 0 };

/** A missing confidence as a weight means unweighted, not worthless: `?? 0` would silently zero the whole signal. */
export const weightOf = (answer: { readonly confidence?: number | undefined }) => answer.confidence ?? 1;

/** The top three carry the weight: a franchise splits its mass across its films and is still a committed answer. */
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

  // what an indifferent model would spread evenly carries no information
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
 * Weighed by mass and nothing else: every shard was asked the same question, so `1 - none` is
 * the one comparable quantity. Merging on confidence once let a shard that confidently held
 * nothing outrank the one holding the right title.
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

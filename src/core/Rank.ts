import type { FilmCard, Kind } from "./Film.ts";
import type { FilmLabels } from "./Labels.ts";
import type { Subject } from "./Subject.ts";
import {
  ADULT_RATINGS,
  AXES,
  AXIS_IDS,
  decadeOf,
  KIDS_SAFE_THRESHOLD,
  runtimeBand,
  studioOf,
  type AxisId,
  type AxisKind,
  type CountryId,
  type DecadeId,
  type GenreId,
  type OrderingId,
  type StudioId,
  type WantsId,
} from "./Taste.ts";

/**
 * Ranking, in pure code: Jev supplies every judgment, this file does the arithmetic. It reads
 * top to bottom as the pipeline runs — who is eligible, what was asked, how each film answers,
 * the order, the cut. `match` says how well a film answers what was asked and decides whether it
 * reaches the shelf; `fit` adds reputation and only breaks ties. Kept apart so the shelf can be empty.
 */

/** Types */

export type Dist = readonly number[];

export type AxisRead = {
  readonly probabilities: Dist;
  readonly confidence: number;
  readonly relevance: number;
};

export type PersonRead = {
  readonly axes: Readonly<Record<AxisId, AxisRead>>;
  readonly runtime: AxisRead;
  readonly subject: Subject;
  readonly country: CountryId | null;
  readonly studio: StudioId | null;
  readonly genres: readonly GenreId[];
  readonly genreNamed: boolean;
  readonly wantsSimilar: boolean;
  readonly wants: WantsId;
  readonly ordering: OrderingId;
  readonly decade: DecadeId;
  readonly childrenWatching: boolean;
};

export type Tier = "named" | "kept" | "rest";

export type Ranked = {
  readonly film: FilmCard;
  readonly fit: number;
  readonly match: number;
  readonly qualifies: boolean;
  readonly tier: Tier;
};

export type Mode = "named" | "browse" | "ranked";

export type Ranking = { readonly rows: readonly Ranked[]; readonly mode: Mode };

export type RankInput = {
  readonly person: PersonRead;
  readonly films: readonly FilmCard[];
  readonly labels: ReadonlyMap<string, FilmLabels>;
};

/** Tuning */

export const TOPICAL = 3;
/**
 * Named when a title's merged score is at least this share of the strongest anywhere. A shard
 * holding none of the answer still names a best guess, at 0.06–0.12; the weakest right answer
 * sits at 0.15+. Anything from 0.12 to 0.20 draws the same shelves.
 */
export const SEED_FLOOR = 0.15;
/**
 * Gate on the subject's weight, how much of the answer landed in a title at all. Measured at
 * 2,061 titles: mood queries 0.03–0.17, subject queries 0.21+. It drifts upward as the catalog
 * grows, so measure again on every growth.
 */
export const COMMITTED = 0.2;
const DIFFUSE = 0.35;

export const COUNTRY_MIN = 4;
export const GENRE_MIN = 3;

export const PRIOR = 0.4;
export const FLOOR = 0.3;
/**
 * "Scare me" with children watching: tension carries a quarter of the weight and every kid-safe
 * film scores zero on it. A total score cannot catch that — it scores 0.47 against 0.49 for a
 * query that works — so an axis carrying this share of the ask is a must-have, not a preference.
 */
export const DEALBREAKER_SHARE = 0.15;
export const DEALBREAKER_FIT = 0.25;
/** Past the leader, `match` values sit about 0.004 apart, so a fixed gap cuts arbitrarily; this is a fraction of the spread across the top fifty. */
export const GAP_OF_SPREAD = 0.35;
/**
 * The floor under that fraction, for when the top fifty are flat. 0.05 let a lone leader shrink a
 * shelf of four hundred qualifying rows to two — "long day, I just want to switch off" showed one
 * calm anime and nothing else. Measured: 0.10 fills every such shelf; 0.08 leaves one at eight.
 */
const MIN_GAP = 0.1;
const SPREAD_ROW = 49;
export const MAX_RESULTS = 12;
/** `match` is a ratio; below this much ask, a tiny denominator turns noise into a score. */
export const MIN_ASKED = 0.8;
export const ORDERING_WEIGHT = 4;
/** A stated length pulls as hard as a named subject: at its bare relevance it was worth 0.6 against a subject's 2.3, and "like Interstellar, but shorter" led with a 149-minute film. */
export const RUNTIME_STATED = 3;
const STATED_RELEVANCE = 0.7;
const STATED_CONFIDENCE = 0.5;
const WANT_MIN = 0.01;
const UNKNOWN_RUNTIME = 0.5;

/** Distributions */

const LEVELS = 4;

const normalize = (distribution: Dist, levels = LEVELS): Dist => {
  const total = distribution.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return Array.from({ length: levels }, () => 1 / levels);
  return Array.from({ length: levels }, (_, i) => (distribution[i] ?? 0) / total);
};

type Mass = (person: Dist, film: Dist) => number;

const sharedMass: Mass = (person, film) => {
  let mass = 0;
  for (let i = 0; i < LEVELS; i += 1) mass += Math.min(person[i], film[i]);
  return mass;
};

/** A budget, not a target: a film asking less than the person can take is as welcome as one asking exactly that. */
const ceilingMass: Mass = (person, film) => {
  let fit = 0;
  let budget = 1;
  for (let asked = 0; asked < LEVELS; asked += 1) {
    fit += film[asked] * budget;
    budget -= person[asked];
  }
  return fit < 0 ? 0 : fit > 1 ? 1 : fit;
};

const MASS: Record<AxisKind, Mass> = { match: sharedMass, ceiling: ceilingMass };

export const overlap = (person: Dist, film: Dist, levels = LEVELS) =>
  sharedMass(normalize(person, levels), normalize(film, levels));

export const ceilingFit = (person: Dist, film: Dist, levels = LEVELS) =>
  ceilingMass(normalize(person, levels), normalize(film, levels));

const ONE_HOT: readonly Dist[] = Array.from({ length: LEVELS }, (_, level) =>
  Array.from({ length: LEVELS }, (_, i) => (i === level ? 1 : 0)),
);

/** Catalog tables — properties of the catalog, cached on its identity; rebuilt per press they cost half a frame. */

type Normalized = ReadonlyMap<string, Readonly<Record<AxisId, Dist>>>;
const NORMALIZED = new WeakMap<ReadonlyMap<string, FilmLabels>, Normalized>();
const MEANS = new WeakMap<ReadonlyMap<string, FilmLabels>, Readonly<Record<AxisId, Dist>>>();
const RARITY = new WeakMap<readonly FilmCard[], (genre: string) => number>();

/** The one cast in the file, in one place: a record over a closed set of ids. */
const byAxis = <T,>(of: (axis: AxisId) => T): Readonly<Record<AxisId, T>> =>
  Object.fromEntries(AXIS_IDS.map((axis) => [axis, of(axis)])) as Record<AxisId, T>;

const normalizedAxes = (labels: ReadonlyMap<string, FilmLabels>): Normalized => {
  const cached = NORMALIZED.get(labels);
  if (cached !== undefined) return cached;
  const table = new Map(
    [...labels].map(([id, label]) => [id, byAxis((axis) => normalize(label.axes[axis]))]),
  );
  NORMALIZED.set(labels, table);
  return table;
};

const meanOf = (labels: ReadonlyMap<string, FilmLabels>): Readonly<Record<AxisId, Dist>> => {
  const cached = MEANS.get(labels);
  if (cached !== undefined) return cached;
  const rows = [...labels.values()];
  const means = byAxis((axis) => {
    const sum = rows.reduce((acc, label) => acc.map((v, i) => v + (label.axes[axis][i] ?? 0)), [0, 0, 0, 0]);
    return rows.length === 0 ? normalize([]) : sum.map((v) => v / rows.length);
  });
  MEANS.set(labels, means);
  return means;
};

/** Sharing Sci-Fi says a lot, sharing Drama almost nothing. */
const rarityOf = (films: readonly FilmCard[]) => {
  const cached = RARITY.get(films);
  if (cached !== undefined) return cached;
  const counts = new Map<string, number>();
  for (const film of films) {
    for (const genre of film.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  const weights = new Map([...counts].map(([genre, count]) => [genre, Math.log(films.length / count)]));
  const tells = (genre: string) => weights.get(genre) ?? 0;
  RARITY.set(films, tells);
  return tells;
};

/** Pool */

/** A filter that matched nothing and fell back has narrowed nothing, and must not buy a pass on the floor. */
type Outcome = "unasked" | "kept" | "empty";
type Facet = { readonly pool: readonly FilmCard[]; readonly outcome: Outcome };
type Pool = { readonly films: readonly FilmCard[]; readonly faceted: boolean };

const unasked = (pool: readonly FilmCard[]): Facet => ({ pool, outcome: "unasked" });

const narrow = (pool: readonly FilmCard[], keep: (film: FilmCard) => boolean): Facet => {
  const kept = pool.filter(keep);
  return kept.length > 0 ? { pool: kept, outcome: "kept" } : { pool, outcome: "empty" };
};

const insist = (kept: readonly FilmCard[]): Facet => ({ pool: kept, outcome: kept.length > 0 ? "kept" : "empty" });

/** A tapped "kids" is the most stated facet there is, so it narrows the shelf and counts as one. */
const admitted = (
  films: readonly FilmCard[],
  labels: ReadonlyMap<string, FilmLabels>,
  childrenWatching: boolean,
): Facet => {
  const labelled = films.filter((film) => labels.has(film.id));
  if (!childrenWatching) return unasked(labelled);
  const kidSafe = (film: FilmCard) => (labels.get(film.id)?.facts.kids_safe ?? 0) >= KIDS_SAFE_THRESHOLD;
  return insist(labelled.filter((film) => !ADULT_RATINGS.has(film.rated) && kidSafe(film)));
};

/** Dropping the outcome is the rule: the kind always falls back and never counts toward `faceted`, unlike a stated genre. */
const ofKind = (pool: readonly FilmCard[], wants: WantsId) =>
  wants === "either" ? pool : narrow(pool, (film) => film.kind === wants).pool;

/** Primary country first: OMDb lists co-producers too, and `includes` called WALL·E Japanese. */
const inCountry = (pool: readonly FilmCard[], country: CountryId | null): Facet => {
  if (country === null) return unasked(pool);
  const primary = pool.filter((film) => film.countries[0] === country);
  if (primary.length >= COUNTRY_MIN) return { pool: primary, outcome: "kept" };
  return narrow(pool, (film) => film.countries.includes(country));
};

/**
 * Only a stated genre filters — "jail breaking" implies Crime, and filtering on that lost The
 * Shawshank Redemption. Several stated genres mean all of them while the shelf has enough, and a
 * stated genre never falls back: for a scary Thai film with a child in the room, none is the answer.
 * A genre the pool holds none of empties the shelf whether or not it was named: `genre_named`
 * decides only whether to narrow, never whether the contradiction is seen.
 */
const inGenre = (pool: readonly FilmCard[], person: PersonRead): Facet => {
  // "for the family" says who is watching, and the audience is its own facet
  const genres = person.genres.filter((genre) => genre !== "Family");
  if (genres.length === 0) return unasked(pool);
  const some = pool.filter((film) => genres.some((genre) => film.genres.includes(genre)));
  if (some.length === 0) return insist(some);
  if (!person.genreNamed) return unasked(pool);
  // all of them while the shelf has enough; otherwise let the least certain go, one at a time,
  // but never down to "any of them" — that put family comedies on a documentary shelf
  const holding = (asked: readonly GenreId[]): readonly FilmCard[] => {
    const every = pool.filter((film) => asked.every((genre) => film.genres.includes(genre)));
    return every.length >= GENRE_MIN || asked.length === 1 ? every : holding(asked.slice(0, -1));
  };
  return insist(holding(genres));
};

/** A stated studio never falls back, like a stated genre: a Netflix original with a child in the room is the kid-safe Netflix shelf or nothing. */
const inStudio = (pool: readonly FilmCard[], studio: StudioId | null): Facet =>
  studio === null ? unasked(pool) : insist(pool.filter((film) => studioOf(film.studio) === studio));

const inDecade = (pool: readonly FilmCard[], decade: DecadeId): Facet =>
  decade === "none" ? unasked(pool) : narrow(pool, (film) => decadeOf(film.year) === decade);

const allKept = (facets: readonly Facet[]) => {
  const asked = facets.filter((facet) => facet.outcome !== "unasked");
  return asked.length > 0 && asked.every((facet) => facet.outcome === "kept");
};

const poolOf = ({ person, films, labels }: RankInput, anchorId: string | null): Pool => {
  const admit = admitted(films, labels, person.childrenWatching);
  const eligible = admit.pool.filter((film) => film.id !== anchorId);
  const country = inCountry(ofKind(eligible, person.wants), person.country);
  const studio = inStudio(country.pool, person.studio);
  const genre = inGenre(studio.pool, person);
  const decade = inDecade(genre.pool, person.decade);
  return { films: decade.pool, faceted: allKept([admit, country, studio, genre, decade]) };
};

/** Weights */

type Want = {
  readonly axis: AxisId;
  readonly normalized: Dist;
  readonly mass: Mass;
  readonly weight: number;
};

type Weights = {
  readonly wants: readonly Want[];
  readonly mustHave: readonly Want[];
  readonly runtime: { readonly wanted: Dist; readonly weight: number; readonly stated: boolean };
  readonly topical: number;
  readonly ordering: number;
  readonly askedFor: number;
};

/**
 * Relevance squared, confidence first-power. Relevance says whether the person raised the axis
 * (AUC 0.98 against unmentioned axes); confidence only says how sharp the level is (AUC 0.53 —
 * Jev is confident in fallback levels too). The exponent is bounded both ways: under 1.75
 * "horny" still returns a sitcom, over 2 "a prestige tv drama" loses its shelf.
 */
const weightsOf = (person: PersonRead): Weights => {
  const wants = AXIS_IDS.map((axis) => ({
    axis,
    normalized: normalize(person.axes[axis].probabilities),
    mass: MASS[AXES[axis].kind],
    weight: person.axes[axis].relevance ** 2 * person.axes[axis].confidence,
  })).filter((want) => want.weight > WANT_MIN);

  const stated =
    person.runtime.relevance >= STATED_RELEVANCE && person.runtime.confidence >= STATED_CONFIDENCE;
  const runtime = {
    wanted: normalize(person.runtime.probabilities),
    weight: person.runtime.relevance * person.runtime.confidence * (stated ? RUNTIME_STATED : 1),
    stated,
  };
  const topical = TOPICAL * person.subject.weight;
  const ordering = person.ordering === "none" ? 0 : ORDERING_WEIGHT;
  const askedFor = wants.reduce((sum, want) => sum + want.weight, 0) + runtime.weight + topical + ordering;
  const mustHave = wants.filter((want) => askedFor > 0 && want.weight / askedFor >= DEALBREAKER_SHARE);
  return { wants, mustHave, runtime, topical, ordering, askedFor };
};

const seedsOf = (person: PersonRead): Readonly<Record<string, number>> =>
  person.subject.weight < COMMITTED ? {} : person.subject.scores;

/** "Something like Interstellar" names a yardstick, not an answer. */
const anchorOf = (person: PersonRead): string | null =>
  person.wantsSimilar && person.subject.weight >= COMMITTED
    ? (Object.entries(person.subject.scores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
    : null;

/** Resemblance */

type Resemblance = (film: FilmCard) => number;

const weightedOverlap = (weights: readonly (readonly [AxisId, number])[], total: number, a: Readonly<Record<AxisId, Dist>>, b: Readonly<Record<AxisId, Dist>>) => {
  if (total <= 0) return 0;
  let sum = 0;
  for (const [axis, weight] of weights) sum += weight * sharedMass(a[axis], b[axis]);
  return sum / total;
};

/**
 * Genre carries most of it, by rarity and squared, so half the genres in common is worth a
 * quarter. The axes count where the reference is unusual against the shelf's average — or a
 * superhero film looks closer to Interstellar than 2001 does. The director is the tiebreak genre
 * cannot give: every candidate shares Adventure and Sci-Fi with Interstellar; Inception is first
 * because of who made it.
 */
const resemblanceTo = (anchorId: string | null, films: readonly FilmCard[], labels: ReadonlyMap<string, FilmLabels>): Resemblance => {
  if (anchorId === null) return () => 0;
  const normalized = normalizedAxes(labels);
  const anchor = labels.get(anchorId);
  const anchorAxes = normalized.get(anchorId);
  const card = films.find((film) => film.id === anchorId);
  if (anchor === undefined || card === undefined || anchorAxes === undefined) return () => 0;

  const mean = meanOf(labels);
  const tells = rarityOf(films);
  const unusual = AXIS_IDS.map((axis) => [axis, 1 - overlap(anchor.axes[axis], mean[axis])] as const);
  const unusualTotal = unusual.reduce((sum, [, weight]) => sum + weight, 0);
  const anchorGenres = new Set(card.genres);
  const genreTotal = card.genres.reduce((sum, genre) => sum + tells(genre), 0);

  return (film) => {
    const mine = normalized.get(film.id);
    const onAxes = mine === undefined ? 0 : weightedOverlap(unusual, unusualTotal, anchorAxes, mine);
    let inCommon = 0;
    for (const genre of film.genres) if (anchorGenres.has(genre)) inCommon += tells(genre);
    const onGenre = genreTotal === 0 ? 0 : inCommon / genreTotal;
    const sameHand = card.director !== "" && film.director === card.director ? 1 : 0;
    return 0.35 * onAxes + 0.45 * onGenre * onGenre + 0.2 * sameHand;
  };
};

/** Ordering */

type OrderingScore = (film: FilmCard) => number;

/** IMDb's own shrinkage toward the mean: on the raw rating, "the best thing on this shelf" was Planet Earth. */
const weightedRating = (film: FilmCard, mean: number, median: number) =>
  (film.imdbVotes * film.imdbRating + median * mean) / (film.imdbVotes + median);

const RATING_FLOOR = 7.5;
const RATING_SPAN = 1.8;

const yearSpan = (pool: readonly FilmCard[]) => {
  const years = pool.map((film) => film.year);
  return { oldest: Math.min(...years), newest: Math.max(...years) };
};

/** An ordering is a sort, not a preference; stats are computed for the ordering asked, only. */
const SCORERS: Record<OrderingId, (pool: readonly FilmCard[]) => OrderingScore> = {
  none: () => () => 0,
  // "surprise me" is a request for anything: browse the best of the box rather than invent a taste
  anything: (pool) => SCORERS.best_rated(pool),
  best_rated: (pool) => {
    const ratings = pool.map((film) => film.imdbRating);
    const mean = ratings.reduce((sum, r) => sum + r, 0) / Math.max(1, ratings.length);
    const median = pool.map((film) => film.imdbVotes).sort((a, b) => a - b)[Math.floor(pool.length / 2)] ?? 0;
    return (film) => Math.max(0, Math.min(1, (weightedRating(film, mean, median) - RATING_FLOOR) / RATING_SPAN));
  },
  newest: (pool) => {
    const { oldest, newest } = yearSpan(pool);
    return (film) => (film.year - oldest) / Math.max(1, newest - oldest);
  },
  oldest: (pool) => {
    const { oldest, newest } = yearSpan(pool);
    return (film) => (newest - film.year) / Math.max(1, newest - oldest);
  },
};

/** Score */

type Scored = Ranked & { readonly seed: number; readonly genreFit: number; readonly sortKey: number };

type Scoring = {
  readonly weights: Weights;
  readonly seeds: Readonly<Record<string, number>>;
  readonly genres: readonly GenreId[];
  readonly anchored: boolean;
  readonly faceted: boolean;
  readonly resembles: Resemblance;
  readonly orderingScore: OrderingScore;
  readonly countOfKind: Readonly<Record<Kind, number>>;
};

const priorOf = (film: FilmCard, countOfKind: number) => 1 - (film.imdbRank - 1) / Math.max(1, countOfKind);

const countOfKind = (films: readonly FilmCard[]): Record<Kind, number> => {
  const counts = { movie: 0, series: 0 };
  for (const film of films) counts[film.kind] += 1;
  return counts;
};

const scoreFilm =
  ({ weights, seeds, genres, anchored, faceted, resembles, orderingScore, countOfKind }: Scoring) =>
  (film: FilmCard, mine: Readonly<Record<AxisId, Dist>>): Scored => {
    let mood = 0;
    for (const want of weights.wants) mood += want.weight * want.mass(want.normalized, mine[want.axis]);
    const qualifiesOnMood = weights.mustHave.every(
      (want) => want.mass(want.normalized, mine[want.axis]) >= DEALBREAKER_FIT,
    );

    const lengthFit = film.runtime === 0 ? UNKNOWN_RUNTIME : ceilingMass(weights.runtime.wanted, ONE_HOT[runtimeBand(film.runtime)]);
    const runtime = weights.runtime.weight > 0 ? weights.runtime.weight * lengthFit : 0;
    // an unknown runtime passes because UNKNOWN_RUNTIME sits above DEALBREAKER_FIT
    const withinLength = !weights.runtime.stated || lengthFit >= DEALBREAKER_FIT;

    const named = seeds[film.id] ?? 0;
    const seed = anchored ? Math.max(named, resembles(film)) : named;
    const sortKey = orderingScore(film);
    const asked = mood + runtime + weights.topical * seed + weights.ordering * sortKey;
    const match = weights.askedFor >= MIN_ASKED ? asked / weights.askedFor : 0;
    const fit = (asked + PRIOR * priorOf(film, countOfKind[film.kind])) / (weights.askedFor + PRIOR);

    // an anchored query has no named band: the one title Jev named is the yardstick and is already gone
    const tier: Tier = !anchored && named >= SEED_FLOOR ? "named" : anchored || faceted ? "kept" : "rest";
    const genreFit = genres.length === 0 ? 0 : genres.filter((genre) => film.genres.includes(genre)).length / genres.length;
    return { film, fit, match, qualifies: withinLength && qualifiesOnMood, tier, seed, genreFit, sortKey };
  };

/** Sort */

type Compare = (a: Scored, b: Scored) => number;

/** Compared at six places, so float noise cannot outrank the reputation tiebreak. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const TIER_ORDER: Record<Tier, number> = { named: 2, kept: 1, rest: 0 };
const byTier: Compare = (a, b) => TIER_ORDER[b.tier] - TIER_ORDER[a.tier];
const bySortKey: Compare = (a, b) => round(b.sortKey) - round(a.sortKey);
const bySeed: Compare = (a, b) => round(b.seed) - round(a.seed);
const byGenreFit: Compare = (a, b) => round(b.genreFit) - round(a.genreFit);
const byFit: Compare = (a, b) => round(b.fit) - round(a.fit);
const byReputation: Compare = (a, b) => a.film.imdbRank - b.film.imdbRank;
const byId: Compare = (a, b) => a.film.id.localeCompare(b.film.id);

/** An ordering request replaces the bands and the seeds outright. */
const ORDERED: readonly Compare[] = [bySortKey, byGenreFit, byFit, byReputation, byId];
const MATCHED: readonly Compare[] = [byTier, bySeed, byGenreFit, byFit, byReputation, byId];

const lexicographic =
  (keys: readonly Compare[]): Compare =>
  (a, b) => {
    for (const key of keys) {
      const delta = key(a, b);
      if (delta !== 0) return delta;
    }
    return 0;
  };

const toRanked = ({ film, fit, match, qualifies, tier }: Scored): Ranked => ({ film, fit, match, qualifies, tier });

/** Rank */

/**
 * A question about the shelf rather than about a film wants a list, not a cut. The last
 * conjunct needs both halves: a barely-there subject is diffuse by definition, so on
 * concentration alone this fired for "scare me" with children in the room and waved the shelf
 * past the dealbreaker that was supposed to send it back empty.
 */
const browsing = (person: PersonRead, weights: Weights, pool: Pool) =>
  weights.ordering > 0 ||
  pool.faceted ||
  person.decade !== "none" ||
  (person.subject.weight >= COMMITTED && person.subject.concentration < DIFFUSE);

const isNamed = (row: Ranked) => row.tier === "named" && row.qualifies;

const modeOf = (rows: readonly Ranked[], browse: boolean): Mode =>
  rows.some(isNamed) ? "named" : browse ? "browse" : "ranked";

export const rank = (input: RankInput): Ranking => {
  const { person, films, labels } = input;
  const anchorId = anchorOf(person);
  const pool = poolOf(input, anchorId);
  const weights = weightsOf(person);
  const normalized = normalizedAxes(labels);
  const score = scoreFilm({
    weights,
    seeds: seedsOf(person),
    genres: person.genres,
    anchored: anchorId !== null,
    faceted: pool.faceted,
    resembles: resemblanceTo(anchorId, films, labels),
    orderingScore: SCORERS[person.ordering](pool.films),
    countOfKind: countOfKind(films),
  });
  // a title without labels is not eligible, the rule the pool already applies
  const rows = pool.films
    .flatMap((film) => {
      const mine = normalized.get(film.id);
      return mine === undefined ? [] : [score(film, mine)];
    })
    .sort(lexicographic(weights.ordering > 0 ? ORDERED : MATCHED))
    .map(toRanked);
  return { rows, mode: modeOf(rows, browsing(person, weights, pool)) };
};

/** Shortlist */

/** A sharp query returns three films, a vague one a dozen, and one nothing answers returns nothing. */
const aboveFloor = (rows: readonly Ranked[]) => {
  const qualified = rows.filter((row) => row.qualifies && row.match >= FLOOR);
  if (qualified.length === 0) return [];
  // measured from the second row: a leader far above a dense field is an outlier, not a sharp query
  const leader = qualified[Math.min(1, qualified.length - 1)].match;
  const spread = leader - qualified[Math.min(SPREAD_ROW, qualified.length - 1)].match;
  const gap = Math.max(MIN_GAP, GAP_OF_SPREAD * spread);
  return qualified.filter((row) => row.match >= leader - gap);
};

/**
 * A named title still has to pass `qualifies`; the fill behind it does not, because a `kept`
 * tier already means a stated facet narrowed the shelf. That is also why the fill needs no
 * browse check: `kept` and `named` can only coexist when a facet fired.
 */
const CUTS: Record<Mode, (rows: readonly Ranked[]) => readonly Ranked[]> = {
  // the shelf is twelve: when the Choice named fewer, the rest is ranked like any other read
  named: (rows) => {
    const led = [...rows.filter(isNamed), ...rows.filter((row) => row.tier === "kept")];
    return led.length >= MAX_RESULTS ? led : [...led, ...aboveFloor(rows.filter((row) => !led.includes(row)))];
  },
  browse: (rows) => rows.filter((row) => row.qualifies),
  ranked: aboveFloor,
};

export const shortlist = ({ rows, mode }: Ranking): readonly Ranked[] =>
  CUTS[mode](rows).slice(0, MAX_RESULTS);

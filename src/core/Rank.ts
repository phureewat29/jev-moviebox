import type { FilmCard } from "./Film.ts";
import type { FilmLabels } from "./Labels.ts";
import {
  AXES,
  AXIS_IDS,
  decadeOf,
  runtimeBand,
  type AxisId,
  type CountryId,
  type DecadeId,
  type GenreId,
  type OrderingId,
  type WantsId,
} from "./Taste.ts";

/**
 * Ranking, in pure code. Jev supplies every judgment; everything here is arithmetic the model
 * is explicitly bad at, so nothing in this file calls it.
 *
 * A film carries two scores. `match` is how well it answers what was actually asked, and only
 * that. `fit` adds the reputation prior and is what the order is drawn from. Keeping them apart
 * is what lets the shelf come back empty: a famous film answering none of the question scores
 * near zero on `match`, however high its `fit` would otherwise have been.
 */

export type Dist = readonly number[];

export type Axis = {
  readonly probabilities: Dist;
  /** How sure Jev was of the level. */
  readonly confidence: number;
  /** Whether the person said anything bearing on this axis at all. */
  readonly relevance: number;
};

export type Subject = {
  /** Scaled so the leader is 1 and an uninformative probability is 0. Ratios are preserved. */
  readonly scores: Readonly<Record<string, number>>;
  /**
   * How far the Choice committed, from 0 to 1. Built from the mass on its top three against
   * the mass on `none`, discounted by its own confidence. The top *three* because a franchise
   * splits mass across its films, and that is a committed answer, not an uncertain one.
   */
  readonly weight: number;
  /**
   * How concentrated that answer was. "Batman" lands on one film; "anime" spreads across
   * dozens, and a category naming dozens of right answers wants a list, not a single tile.
   */
  readonly concentration: number;
};

export type PersonRead = {
  readonly axes: Readonly<Record<AxisId, Axis>>;
  readonly runtime: Axis;
  readonly subject: Subject;
  readonly country: CountryId | null;
  readonly genres: readonly GenreId[];
  /** Whether the person said a genre outright. Only a stated genre may filter the shelf. */
  readonly genreNamed: boolean;
  /** Whether they asked for something *like* a title, in which case that title is not an answer. */
  readonly wantsSimilar: boolean;
  readonly wants: WantsId;
  readonly ordering: OrderingId;
  readonly decade: DecadeId;
  readonly childrenWatching: boolean;
};

export type Ranked = {
  readonly film: FilmCard;
  readonly fit: number;
  readonly match: number;
  /** False when the film misses something the person plainly asked for. */
  readonly qualifies: boolean;
  /** 2 when Jev named it, 1 when a stated facet kept it, 0 otherwise. */
  readonly tier: number;
  /**
   * True when the question was about the shelf rather than about a film — a decade, or an
   * ordering. Those want a list to look through, so the shortlist does not trim them hard.
   */
  readonly browsing: boolean;
};

/** The ratings that veto a film for children outright, film and television alike. */
const ADULT_RATINGS = new Set(["R", "NC-17", "X", "TV-MA"]);

/** A film reaches a child only if Jev says so and the rating does not veto it. */
export const KIDS_SAFE_THRESHOLD = 0.6;

/** How hard a named subject outweighs mood. "batman" has to beat every mood consideration. */
export const TOPICAL = 3;

/**
 * Above this the Choice is pointing at a title rather than leaving it alone. Jev's answer to
 * "which of these did they mean" is the answer to the question; everything below is the tail
 * of a distribution that has to sum to one.
 */
export const SEED_FLOOR = 0.08;

/**
 * How far the Choice has to have committed before its answer counts as a named title at all.
 * The scores are scaled so the leader is always 1, so every query has a top title however little
 * the Choice meant it — and "wreck me" duly came back holding Fight Club. Measured across the
 * suite, mood queries land at 0.04 to 0.11 and genuine subject queries at 0.19 and up.
 */
export const COMMITTED = 0.15;

/** A country filter prefers the country that actually made the film, while it still has this many. */
export const COUNTRY_MIN = 4;

/** Several stated genres mean all of them, while the shelf holds at least this many such titles. */
export const GENRE_MIN = 3;

/** Reputation breaks ties between films that already answer the question; it never qualifies one. */
export const PRIOR = 0.4;

/** Below this a film answers too little of what was asked to be worth a slot. */
export const FLOOR = 0.3;

/**
 * An axis carrying at least this share of everything the person asked for is a must-have, not a
 * preference. Ask to be scared with children in the room and tension carries a quarter of the
 * weight while every kid-safe film scores zero on it — so the shelf comes back empty instead of
 * offering Toy Story. A total score cannot catch this: the contradiction still scores 0.47
 * against 0.49 for a query that genuinely works.
 */
export const DEALBREAKER_SHARE = 0.15;
export const DEALBREAKER_FIT = 0.25;

/**
 * How far behind the leader still earns a slot, as a fraction of the spread across the top 50.
 * A fixed gap cuts arbitrarily: past the leader, scores can sit 0.004 apart.
 */
export const GAP_OF_SPREAD = 0.35;

export const MAX_RESULTS = 12;

/**
 * Below this the person has not asked for enough to rank on. `match` is a ratio, so a tiny
 * denominator turns noise into a confident-looking score: an empty box once returned twelve
 * films at 0.47. Under this much signal the shelf just stays as it was.
 */
export const MIN_ASKED = 0.8;

/** How hard "the best rated" pulls, once Jev says that is what was asked. */
export const ORDERING_WEIGHT = 4;

/**
 * A length the person stated pulls as hard as a subject they named. Left at its bare relevance
 * it was worth 0.6 against a subject's 2.3, so "like Interstellar, but shorter" ordered on
 * resemblance and led with a 149-minute film.
 */
export const RUNTIME_STATED = 3;

/**
 * "The best thing on this shelf" sorted on the raw IMDb rating and returned Planet Earth, because
 * nine of the twelve highest-rated titles here are series and a nature documentary is rated by
 * the people who went looking for it. IMDb's own weighting fixes it: shrink each rating toward
 * the catalog mean by how few people voted, with the catalog's median vote count as the weight.
 */
const weightedRating = (film: FilmCard, mean: number, median: number) =>
  (film.imdbVotes * film.imdbRating + median * mean) / (film.imdbVotes + median);

/**
 * Jev's probabilities come back summing to 0.99 or 1.00, so every comparison normalizes rather
 * than trusting the total.
 */
const normalize = (distribution: Dist, levels: number): number[] => {
  const total = distribution.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return Array.from({ length: levels }, () => 1 / levels);
  return Array.from({ length: levels }, (_, i) => (distribution[i] ?? 0) / total);
};

/**
 * Shared probability mass: 1 when the two agree exactly, 0 when they have nothing in common.
 * Iterates the rubric's own level count, so mass the person put on a level the film's answer
 * omits still counts against them.
 */
export const overlap = (person: Dist, film: Dist, levels: number): number => {
  const p = normalize(person, levels);
  const q = normalize(film, levels);
  let shared = 0;
  for (let i = 0; i < levels; i += 1) shared += Math.min(p[i], q[i]);
  return shared;
};

/**
 * For an axis that is a budget rather than a target. The person states the most they can take;
 * a film asking less is just as welcome, so only asking *more* costs anything. Without this,
 * "I'm fully recharged" would push every easy film to the bottom, which nobody means.
 */
export const ceilingFit = (person: Dist, film: Dist, levels: number): number => {
  const p = normalize(person, levels);
  const q = normalize(film, levels);
  let fit = 0;
  let budget = 1;
  for (let asked = 0; asked < levels; asked += 1) {
    fit += q[asked] * budget;
    budget -= p[asked];
  }
  return Math.max(0, Math.min(1, fit));
};

const axisFit = (axis: AxisId, person: Dist, film: Dist) =>
  AXES[axis].kind === "ceiling" ? ceilingFit(person, film, 4) : overlap(person, film, 4);

export type RankInput = {
  readonly person: PersonRead | null;
  readonly films: readonly FilmCard[];
  readonly labels: ReadonlyMap<string, FilmLabels>;
  readonly excluded?: ReadonlySet<string>;
};

const oneHot = (level: number, levels = 4): Dist =>
  Array.from({ length: levels }, (_, i) => (i === level ? 1 : 0));

/**
 * Reputation, per kind. Ranks restart at 1 for films and for series, so the count has to be
 * the count of that kind or every series would look more famous than it is.
 */
const priorOf = (film: FilmCard, countOfKind: number) =>
  1 - (film.imdbRank - 1) / Math.max(1, countOfKind);

/**
 * The shelf's average distribution per axis. It describes the catalog, not the query, so it is
 * computed once per label set rather than once per press: folded into `rank` it cost 7ms of a
 * 16ms frame on every "something like X", which is a dropped frame at exactly the moment the
 * results animate in.
 */
const MEANS = new WeakMap<ReadonlyMap<string, FilmLabels>, ReadonlyMap<AxisId, Dist>>();

/**
 * Every film's axis distributions, normalized once. `overlap` normalizes both sides on every
 * call and allocates two arrays doing it; comparing one anchor against 744 films across ten
 * axes ran that 7,440 times per press. The labels never change, so this is done per label set.
 */
const NORMALIZED = new WeakMap<
  ReadonlyMap<string, FilmLabels>,
  ReadonlyMap<string, Readonly<Record<AxisId, Dist>>>
>();

const normalizedAxes = (
  labels: ReadonlyMap<string, FilmLabels>,
): ReadonlyMap<string, Readonly<Record<AxisId, Dist>>> => {
  const cached = NORMALIZED.get(labels);
  if (cached !== undefined) return cached;
  const table = new Map<string, Record<AxisId, Dist>>();
  for (const [id, label] of labels) {
    const row = {} as Record<AxisId, Dist>;
    for (const axis of AXIS_IDS) row[axis] = normalize(label.axes[axis], 4);
    table.set(id, row);
  }
  NORMALIZED.set(labels, table);
  return table;
};

/**
 * How much a shared genre actually tells you, by how rare it is on this shelf. Counting genres
 * equally made Avengers: Endgame and The Lord of the Rings the films most like Interstellar, on
 * the strength of Drama and Adventure. A property of the catalog, so it is counted once.
 */
const RARITY = new WeakMap<readonly FilmCard[], (genre: string) => number>();

const rarityOf = (films: readonly FilmCard[]) => {
  const cached = RARITY.get(films);
  if (cached !== undefined) return cached;
  const seen = new Map<string, number>();
  for (const film of films) {
    for (const genre of film.genres) seen.set(genre, (seen.get(genre) ?? 0) + 1);
  }
  const weights = new Map<string, number>();
  for (const [genre, count] of seen) weights.set(genre, Math.log(films.length / Math.max(1, count)));
  const tells = (genre: string) => weights.get(genre) ?? 0;
  RARITY.set(films, tells);
  return tells;
};

/** The four one-hot runtime bands, built once rather than per film. */
const ONE_HOT: readonly Dist[] = [0, 1, 2, 3].map((level) =>
  Array.from({ length: 4 }, (_, i) => (i === level ? 1 : 0)),
);

/** A budget rather than a target, both sides already normalized. */
const ceilingMass = (person: Dist, film: Dist) => {
  let fit = 0;
  let budget = 1;
  for (let asked = 0; asked < 4; asked += 1) {
    fit += film[asked] * budget;
    budget -= person[asked];
  }
  return fit < 0 ? 0 : fit > 1 ? 1 : fit;
};

/** Shared probability mass, both sides already normalized. The inner loop of every comparison. */
const sharedMass = (p: Dist, q: Dist) => {
  let mass = 0;
  for (let i = 0; i < 4; i += 1) mass += Math.min(p[i], q[i]);
  return mass;
};

const meanOf = (labels: ReadonlyMap<string, FilmLabels>): ReadonlyMap<AxisId, Dist> => {
  const cached = MEANS.get(labels);
  if (cached !== undefined) return cached;
  const means = new Map<AxisId, Dist>();
  for (const axis of AXIS_IDS) {
    const sum = [0, 0, 0, 0];
    let seen = 0;
    for (const label of labels.values()) {
      const level = label.axes[axis];
      if (level === undefined) continue;
      for (let i = 0; i < 4; i += 1) sum[i] += level[i] ?? 0;
      seen += 1;
    }
    means.set(axis, seen === 0 ? [0.25, 0.25, 0.25, 0.25] : sum.map((v) => v / seen));
  }
  MEANS.set(labels, means);
  return means;
};

export const rank = ({
  person,
  films,
  labels,
  excluded = new Set(),
}: RankInput): readonly Ranked[] => {
  const pool = films.filter((film) => !excluded.has(film.id) && labels.has(film.id));
  const admitted =
    person?.childrenWatching === true
      ? pool.filter(
          (film) =>
            !ADULT_RATINGS.has(film.rated) &&
            (labels.get(film.id)?.facts.kids_safe ?? 0) >= KIDS_SAFE_THRESHOLD,
        )
      : pool;

  /**
   * An axis counts only as far as the person spoke to it. A confident "no romance wanted" from
   * someone who never raised romance is certainty about a question nobody asked.
   */
  /**
   * Normalized once here rather than inside the per-film comparison. Scoring four hundred films
   * against ten axes re-normalized the same person distribution four hundred times over and
   * allocated an array each time, which is most of what the ranking cost.
   */
  const wants = person
    ? AXIS_IDS.map((axis) => ({
        axis,
        distribution: person.axes[axis].probabilities,
        normalized: normalize(person.axes[axis].probabilities, 4),
        ceiling: AXES[axis].kind === "ceiling",
        weight: person.axes[axis].relevance * person.axes[axis].confidence,
      })).filter((want) => want.weight > 0.01)
    : [];
  const runtimeWanted = person ? normalize(person.runtime.probabilities, 4) : ONE_HOT[0];

  const runtimeStated =
    person !== null && person.runtime.relevance >= 0.7 && person.runtime.confidence >= 0.5;
  const runtimeWeight = person
    ? person.runtime.relevance * person.runtime.confidence * (runtimeStated ? RUNTIME_STATED : 1)
    : 0;
  const topicalWeight = person ? TOPICAL * person.subject.weight : 0;
  const orderingWeight = person && person.ordering !== "none" ? ORDERING_WEIGHT : 0;
  /**
   * Genre is not a term in the score. As one it diluted every other weight — which is how
   * "scare me" with children watching stopped coming back empty — and at any weight large
   * enough to matter it outvoted the subject. It filters, or it breaks ties. Nothing else.
   */
  const genreFit = (film: FilmCard) =>
    person === null || person.genres.length === 0
      ? 0
      : person.genres.filter((g) => film.genres.includes(g)).length / person.genres.length;
  const askedFor =
    wants.reduce((sum, want) => sum + want.weight, 0) +
    runtimeWeight +
    topicalWeight +
    orderingWeight;

  /**
   * "Something like Interstellar" names a reference, not a request. The Choice can only answer
   * which title was named, so the shelf showed Interstellar itself — and for "but shorter" it
   * showed a 169-minute film. The named title is the yardstick, never an answer.
   */
  const anchorId =
    person !== null && person.wantsSimilar && person.subject.weight >= COMMITTED
      ? (Object.entries(person.subject.scores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
      : null;

  /** Asked for a series, a film is not a near miss; it is the wrong thing. Same the other way. */
  const referenced = anchorId === null ? admitted : admitted.filter((film) => film.id !== anchorId);
  const ofKind =
    person && person.wants !== "either"
      ? referenced.filter((film) => film.kind === person.wants)
      : referenced;
  const inKind = ofKind.length > 0 ? ofKind : referenced;

  /**
   * Facets are filters over data, not preferences. Asked for Thai films, a French one is not a
   * near miss. Each falls back if it would empty the shelf, so a wrong guess costs nothing.
   */
  /**
   * A filter that matched nothing falls back rather than emptying the shelf, but it is then
   * unsatisfied, and an unsatisfied filter must not buy a pass on the floor. Tracking this as
   * one OR served two gentle Thai dramas to "a scary thai film" with a child in the room.
   */
  const fired: boolean[] = [];
  const narrow = <T,>(pool: readonly T[], keep: (item: T) => boolean) => {
    const kept = pool.filter(keep);
    fired.push(kept.length > 0);
    return kept.length > 0 ? kept : pool;
  };

  /**
   * The country that made it, not every country on the credits. OMDb lists co-producers and
   * distributors, so `includes` called WALL·E Japanese and Terminator 2 French, and "french
   * cinema" answered with Planet Earth II. Falling back to the looser field keeps small
   * countries usable.
   */
  const inCountry =
    person?.country != null
      ? narrow(inKind, (film) =>
          inKind.filter((row) => row.countries[0] === person.country).length >= COUNTRY_MIN
            ? film.countries[0] === person.country
            : film.countries.includes(person.country!),
        )
      : inKind;

  /**
   * A genre filters only when the person said one. "A western" states it, so a film that is not
   * a western is simply wrong. "Jail breaking" merely implies Crime, and filtering on that threw
   * away The Shawshank Redemption, which is tagged Drama. Jev draws the line, not a threshold.
   */
  const named = person !== null && person.genreNamed && person.genres.length > 0;
  /**
   * "Something funny about war" names two, and means both. Taking either filled the shelf with
   * sitcoms — Last Week Tonight is a comedy. Taking both is right while the shelf holds enough
   * of them, and falls back to either when it does not, so a pair of rare genres still answers.
   */
  const everyGenre = named
    ? inCountry.filter((film) => person.genres.every((genre) => film.genres.includes(genre)))
    : inCountry;
  const inGenre = !named
    ? inCountry
    : everyGenre.length >= GENRE_MIN
      ? everyGenre
      : inCountry.filter((film) => person.genres.some((genre) => film.genres.includes(genre)));
  /**
   * A stated genre does not fall back. Asked for a scary Thai film with a child in the room,
   * the shelf holds none, and the honest answer is none rather than two gentle Thai dramas.
   */
  if (named) fired.push(inGenre.length > 0);

  const pool2 =
    person && person.decade !== "none"
      ? narrow(inGenre, (film) => decadeOf(film.year) === person.decade)
      : inGenre;

  /**
   * Only a filter that actually kept something counts. A filter that matched nothing fell back
   * to the whole pool, so it narrowed nothing and must not buy a pass on the floor: "scare me"
   * with children watching finds no kid-safe horror, and the honest answer is still none.
   */
  const faceted = fired.length > 0 && fired.every(Boolean);

  const countOfKind = { movie: 0, series: 0 };
  for (const film of films) countOfKind[film.kind] += 1;

  /**
   * What the Choice actually answered. "Jail breaking" returns Shawshank 1.00, Prison Break 0.75
   * and The Great Escape 0.30 — the answer, already ranked. Feeding that into a weighted average
   * where a genre tag and a reputation prior could outvote it is what lost the right film.
   */
  const seedOf = (film: FilmCard) =>
    person === null || person.subject.weight < COMMITTED ? 0 : (person.subject.scores[film.id] ?? 0);

  /** The reference film's own labels become the taste to match. */
  const anchor = anchorId === null ? null : (labels.get(anchorId) ?? null);
  const anchorCard = anchorId === null ? null : (films.find((film) => film.id === anchorId) ?? null);

  const tells = rarityOf(films);

  /**
   * What is unusual about the reference film, axis by axis, measured against the shelf's own
   * average. Interstellar is ordinary on romance and remarkable on scale, so scale should decide
   * what counts as being like it. Averaging all ten equally let a superhero film look closer to
   * it than 2001 does.
   */
  const shelfMean = anchor === null ? new Map<AxisId, Dist>() : meanOf(labels);
  const normalized = normalizedAxes(labels);
  const anchorAxes = anchorId === null ? undefined : normalized.get(anchorId);
  const unusual = new Map<AxisId, number>();
  for (const axis of AXIS_IDS) {
    unusual.set(
      axis,
      anchor === null ? 0 : 1 - overlap(anchor.axes[axis], shelfMean.get(axis)!, 4),
    );
  }
  const unusualTotal = AXIS_IDS.reduce((sum, axis) => sum + (unusual.get(axis) ?? 0), 0);
  /** The same pairs as a flat array, so the per-film loop does no map lookups at all. */
  const weighted: readonly (readonly [AxisId, number])[] = AXIS_IDS.map((axis) => [
    axis,
    unusual.get(axis) ?? 0,
  ]);

  /** Everything about the anchor that does not change from film to film, worked out once. */
  const anchorGenres = anchorCard === null ? null : new Set(anchorCard.genres);
  const anchorGenreTotal =
    anchorCard === null ? 0 : anchorCard.genres.reduce((sum, genre) => sum + tells(genre), 0);

  /**
   * How much a film is like the one the person named.
   *
   * Genre carries most of it, squared: on an even split The Lion King came fourth for "something
   * like Interstellar" by matching its emotional shape while sharing only Drama and Adventure,
   * and squaring makes half the genres in common worth a quarter rather than a half.
   *
   * The director is the tiebreak that genre cannot supply. Every candidate shares Adventure and
   * Sci-Fi with Interstellar, so genre could not tell 2001 from Black Panther. It is the term
   * that puts Inception first.
   */
  const resembles = (film: FilmCard) => {
    if (anchor === null || anchorAxes === undefined || anchorCard === null) return 0;
    const mine = normalized.get(film.id);
    let onAxes = 0;
    if (unusualTotal > 0 && mine !== undefined) {
      let sum = 0;
      for (const [axis, weight] of weighted) sum += weight * sharedMass(anchorAxes[axis], mine[axis]);
      onAxes = sum / unusualTotal;
    }
    let inCommon = 0;
    for (const genre of film.genres) if (anchorGenres!.has(genre)) inCommon += tells(genre);
    const onGenre = anchorGenreTotal === 0 ? 0 : inCommon / anchorGenreTotal;
    const sameHand = anchorCard.director !== "" && film.director === anchorCard.director ? 1 : 0;
    return 0.35 * onAxes + 0.45 * onGenre * onGenre + 0.2 * sameHand;
  };

  const ratings = pool2.map((film) => film.imdbRating);
  const meanRating = ratings.reduce((sum, r) => sum + r, 0) / Math.max(1, ratings.length);
  const medianVotes =
    [...pool2.map((film) => film.imdbVotes)].sort((a, b) => a - b)[Math.floor(pool2.length / 2)] ??
    0;

  const years = pool2.map((film) => film.year);
  const oldest = Math.min(...years, 0);
  const newest = Math.max(...years, 1);
  const browsing =
    orderingWeight > 0 ||
    faceted ||
    (person?.decade ?? "none") !== "none" ||
    /**
     * A broad category is a browse request wearing a subject's clothes — but only once the
     * Choice has actually committed. A barely-there subject is diffuse by definition, so this
     * fired on "scare me" with children in the room and waved the shelf straight past the
     * dealbreaker that was supposed to send it back empty.
     */
    (person !== null &&
      person.subject.weight >= COMMITTED &&
      person.subject.concentration < 0.35);
  const orderingScore = (film: FilmCard) =>
    person?.ordering === "best_rated"
      ? Math.max(0, Math.min(1, (weightedRating(film, meanRating, medianVotes) - 7.5) / 1.8))
      : person?.ordering === "newest"
        ? (film.year - oldest) / Math.max(1, newest - oldest)
        : person?.ordering === "oldest"
          ? (newest - film.year) / Math.max(1, newest - oldest)
          : 0;

  /**
   * Share of everything asked for. Measuring against the mood budget alone looked tidier but
   * armed the rule far too hard: on a subject query the mood budget is small, so several axes
   * became must-haves and disqualified the right answer.
   */
  const mustHave = wants.filter(
    (want) => askedFor > 0 && want.weight / askedFor >= DEALBREAKER_SHARE,
  );
  /**
   * A stated length is a constraint, not a preference. Weighing its share against everything
   * else asked for let resemblance outvote it — "something like Interstellar, but shorter"
   * answered with Avengers: Endgame at 181 minutes while Jev had two thirds of its mass under
   * two hours. Relevance already answers the only question that matters: did they say so.
   */
  const runtimeMustHave = runtimeStated;

  return pool2
    .map((film) => {
      const label = labels.get(film.id)!;
      const mineAxes = normalized.get(film.id)!;
      const fits = wants.map((want) => ({
        want,
        value: want.ceiling
          ? ceilingMass(want.normalized, mineAxes[want.axis])
          : sharedMass(want.normalized, mineAxes[want.axis]),
      }));
      const mood = fits.reduce((sum, { want, value }) => sum + want.weight * value, 0);
      const withinLength =
        !runtimeMustHave ||
        film.runtime === 0 ||
        ceilingMass(runtimeWanted, ONE_HOT[runtimeBand(film.runtime)]) >= DEALBREAKER_FIT;
      const qualifies =
        withinLength &&
        mustHave.every(
          (want) => (fits.find((f) => f.want.axis === want.axis)?.value ?? 0) >= DEALBREAKER_FIT,
        );
      /** Fifteen series carry no runtime; they are neither short nor long, so they neither win nor lose on it. */
      const runtime =
        runtimeWeight > 0
          ? runtimeWeight *
            (film.runtime === 0 ? 0.5 : ceilingMass(runtimeWanted, ONE_HOT[runtimeBand(film.runtime)]))
          : 0;
      /** Anchored, the tail of the Choice and a resemblance to the named film both count. */
      const seed = anchorId === null ? seedOf(film) : Math.max(seedOf(film), resembles(film));
      const topical = topicalWeight * seed;
      const ordered = orderingWeight * orderingScore(film);
      const asked = mood + runtime + topical + ordered;
      const match = askedFor >= MIN_ASKED ? asked / askedFor : 0;
      const fit = (asked + PRIOR * priorOf(film, countOfKind[film.kind])) / (askedFor + PRIOR);
      /**
       * Three bands, applied before any score. A title the Choice named answers the question by
       * construction; a title a stated facet kept is at least the right kind of thing; the rest
       * are there to fill a browse. Sorting bands first is what stops an average from burying an
       * answer Jev gave outright.
       *
       * An anchored query has no named band: the one title Jev named is the reference and has
       * already been removed, so the shelf is ranked on resemblance rather than on a tail of the
       * Choice that happened to clear the floor. That tail once left the shelf holding "Life".
       */
      const tier =
        anchorId === null && seedOf(film) >= SEED_FLOOR ? 2 : faceted || anchorId !== null ? 1 : 0;
      return {
        film,
        fit,
        match,
        qualifies,
        browsing,
        tier,
        sortKey: orderingScore(film),
        seed,
        genreFit: genreFit(film),
      };
    })
    /**
     * An ordering request is a sort, not a preference. Someone asking for the newest wants them
     * in year order, not the newest-ish film that also happens to suit their mood.
     */
    .sort(
      (a, b) =>
        (orderingWeight > 0 ? round(b.sortKey) - round(a.sortKey) : 0) ||
        /** A named title outranks a merely suitable one, whatever the averages say. */
        (orderingWeight > 0 ? 0 : b.tier - a.tier) ||
        (orderingWeight > 0 ? 0 : round(b.seed) - round(a.seed)) ||
        round(b.genreFit) - round(a.genreFit) ||
        round(b.fit) - round(a.fit) ||
        a.film.imdbRank - b.film.imdbRank ||
        /** Ranks restart per kind, so an id keeps the order total and reproducible. */
        a.film.id.localeCompare(b.film.id),
    )
    .map(({ sortKey: _sortKey, seed: _seed, genreFit: _genreFit, ...row }) => row);
};

/**
 * What reaches the shelf. A sharp query returns three films, a vague one a dozen, and a query
 * nothing answers returns nothing rather than the least-bad thing in stock. "Scare me" with
 * children watching is the case that matters: the kid-safe pool's highest frightening
 * probability is 0.02, so the honest answer is none.
 */
export const shortlist = (ranked: readonly Ranked[]): readonly Ranked[] => {
  /**
   * Titles Jev named outright. They are the answer to the question that was asked, so they are
   * not put through a floor built for scoring films nobody mentioned — that floor is what left
   * "jail breaking" holding Prison Break while The Shawshank Redemption sat at 1.00.
   */
  /**
   * Being named does not excuse a constraint the person stated outright. Without `qualifies`
   * here, "something like Interstellar, but shorter" led with Avengers: Endgame at 181 minutes.
   */
  const named = ranked.filter((row) => row.tier === 2 && row.qualifies);

  /**
   * A stated facet has already narrowed the shelf to the right kind of thing, so it may fill the
   * rest of the page. Without one, a named answer stands alone rather than dragging eleven
   * unrelated titles along behind it.
   */
  if (named.length > 0) {
    const fill = ranked[0]?.browsing === true ? ranked.filter((row) => row.tier === 1) : [];
    return [...named, ...fill].slice(0, MAX_RESULTS);
  }

  /**
   * A facet narrows the shelf to the right kind of thing; it does not excuse a contradiction.
   * Without `qualifies` here, "a scary thai film" with a child in the room answered with two
   * gentle Thai dramas that the dealbreaker had already marked as not qualifying.
   */
  if (ranked[0]?.browsing === true) {
    return ranked.filter((row) => row.qualifies).slice(0, MAX_RESULTS);
  }

  const qualified = ranked.filter((row) => row.qualifies && row.match >= FLOOR);
  if (qualified.length === 0) return [];
  const leader = qualified[0].match;
  const spread = leader - (qualified[49]?.match ?? qualified.at(-1)!.match);
  const gap = Math.max(0.05, GAP_OF_SPREAD * spread);
  return qualified.filter((row) => row.match >= leader - gap).slice(0, MAX_RESULTS);
};

/** Float noise must not outrank the reputation tiebreak, so compare where people can see. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

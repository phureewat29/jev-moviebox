import {
  choice,
  noul,
  score,
  type ChoiceQuestion,
  type NoulQuestion,
  type ScoreQuestion,
} from "@typesafe-ai/sdk";
import { Record } from "effect";
import {
  AXES,
  AXIS_IDS,
  ENDINGS,
  FILM_FACTS,
  PERSON_SIGNALS,
  RUNTIME_LEVELS,
  COUNTRIES,
  COUNTRY_QUESTION,
  DECADES,
  DECADE_QUESTION,
  GENRES,
  genreQuestion,
  ORDERING,
  ORDERING_QUESTION,
  WANTS,
  WANTS_QUESTION,
  RUNTIME_QUESTION,
  RUNTIME_RELEVANCE,
  relevanceCriteria,
  relevanceInstruction,
  type AxisId,
  type Levels,
} from "./Taste.ts";

/**
 * The questions put to Jev, built from the rubric in Taste.ts. This module imports the model
 * SDK, so only the server and the scripts may reach it; the browser reads Taste.ts instead.
 */

type AxisScores = { readonly [K in AxisId]: ScoreQuestion<Levels> };

const axisScores = (side: "film" | "person"): AxisScores =>
  Record.map(AXES, (axis) => score(axis[side], axis.levels));

const endingChoice = (instructions: string): ChoiceQuestion<typeof ENDINGS> =>
  choice(instructions, ENDINGS);

/**
 * One per axis, asked beside it. The key remap is why this needs a cast: `Record.map` cannot
 * prefix keys, and the prefix is what keeps the answers addressable next to the axis answers.
 */
type RelevanceQuestions = { readonly [K in AxisId as `relevance_${K}`]: NoulQuestion };

/** One per genre. Same key remap, same reason: the prefix keeps them addressable. */
type GenreQuestions = { readonly [K in (typeof GENRES)[number] as `genre_${K}`]: NoulQuestion };

const genreNouls = () =>
  Object.fromEntries(
    GENRES.map((genre) => {
      const { instructions, criteria } = genreQuestion(genre);
      return [`genre_${genre}`, noul(instructions, criteria)];
    }),
  ) as GenreQuestions;

const relevanceNouls = () =>
  Object.fromEntries(
    AXIS_IDS.map((axis) => [`relevance_${axis}`, noul(relevanceInstruction(axis), relevanceCriteria)]),
  ) as RelevanceQuestions;

/** Everything asked of one film, in a single request. Ten axes, an ending, six facts. */
export const filmQuestions = () =>
  ({
    ...axisScores("film"),
    ending: endingChoice("How does this film leave the viewer at the end?"),
    ...Record.map(FILM_FACTS, (fact) =>
      noul(fact.instructions, "criteria" in fact ? fact.criteria : undefined),
    ),
  }) as const;

/**
 * Everything read from one person, in a single request. The same eleven axes reworded, the
 * ending they want, how long an evening they have, and the two facts code needs to filter on.
 */
export const personQuestions = () =>
  ({
    ...axisScores("person"),
    ending: endingChoice("Which kind of ending does this person want tonight?"),
    runtime: score(RUNTIME_QUESTION, RUNTIME_LEVELS),
    relevance_runtime: noul(RUNTIME_RELEVANCE, relevanceCriteria),
    ...Record.map(PERSON_SIGNALS, (signal) => noul(signal.instructions, signal.criteria)),
    wants: choice(WANTS_QUESTION, WANTS),
    country: choice(COUNTRY_QUESTION, {
      ...Object.fromEntries(COUNTRIES.map((c) => [c, `Films and series from ${c}.`])),
      none: "They named no country, language or region.",
    }),
    ...genreNouls(),
    ordering: choice(ORDERING_QUESTION, ORDERING),
    decade: choice(DECADE_QUESTION, {
      ...Object.fromEntries(DECADES.map((d) => [d, `Films from the ${d}.`])),
      none: "They named no decade or era.",
    }),
    ...relevanceNouls(),
  }) as const;

export type FilmQuestions = ReturnType<typeof filmQuestions>;
export type PersonQuestions = ReturnType<typeof personQuestions>;

/** The plot's opening sentence is what tells Jev what a film is about, so it is kept short. */
const firstSentence = (plot: string) => {
  const sentence = plot.split(/(?<=\.)\s/)[0] ?? plot;
  return sentence.length > 90 ? `${sentence.slice(0, 88)}…` : sentence;
};

const instructionFor = (kind: "movie" | "series") =>
  `Which of these ${kind === "movie" ? "films" : "series"} is this person asking for? Match on anything the person named: the subject, the theme, the story, a character, a director, an actor, a genre, a country or era, or the title itself. Ignore how the person says they feel.`;

const noneFor = (kind: "movie" | "series") =>
  `No ${kind === "movie" ? "film" : "series"} here answers what the person named, or they described only a mood or an occasion.`;

/** A Choice takes at most 255 options and one of them is `none`. */
export const SHARD_SIZE = 254;

/**
 * The catalog as several Choices. One per kind was the ceiling on how many titles the shelf
 * could hold at all: 254 films and 254 series, with La La Land, Titanic and most of Marvel
 * left off for want of a slot. Splitting each kind into shards of 254 lifts that ceiling, and
 * costs nothing in round trips because questions in one request are answered in parallel.
 *
 * Each shard keeps its own `none`, which is what makes the answers comparable: a shard holding
 * nothing relevant says so, and the merge weighs the shards by how much of the answer landed
 * in each.
 */
export const subjectQuestions = (
  films: ReadonlyArray<SubjectOption & { kind: "movie" | "series" }>,
) => {
  const shards: Record<string, ReturnType<typeof subjectQuestion>> = {};
  for (const kind of ["movie", "series"] as const) {
    const mine = films.filter((film) => film.kind === kind);
    for (let start = 0, index = 0; start < mine.length; start += SHARD_SIZE, index += 1) {
      shards[`subject_${kind}_${index}`] = subjectQuestion(kind, mine.slice(start, start + SHARD_SIZE));
    }
  }
  return shards;
};

export type SubjectOption = {
  id: string;
  title: string;
  year: number;
  plot: string;
  studio?: string | undefined;
};

/**
 * The catalog as a Choice. Everything Jev knows about these titles is already in its weights —
 * "something with Tom Hanks" finds Forrest Gump with no cast in the description — so the
 * description only has to disambiguate: title, year, and the opening line of the plot.
 *
 * There is one of these per kind because a Choice takes at most 255 options and the catalog is
 * larger than that. Splitting by kind rather than arbitrarily keeps each question coherent, and
 * gives each pool its own `none`: "no film fits" and "no series fits" are different answers.
 *
 * Read as a distribution, never as an argmax. `none` carries how little the query was about
 * subject at all, which is what gates the topical term in the ranker.
 */
export const subjectQuestion = (
  kind: "movie" | "series",
  films: ReadonlyArray<SubjectOption>,
) =>
  choice(instructionFor(kind), {
    ...Object.fromEntries(
      films.map((film) => [
        film.id,
        `${film.title} (${film.year})${film.studio === undefined ? "" : ` — ${film.studio}`} — ${firstSentence(film.plot)}`,
      ]),
    ),
    none: noneFor(kind),
  });

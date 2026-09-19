import { Schema } from "effect";

/** The fields this project reads from an OMDb movie record. OMDb writes every value as a string. */
export const OmdbMovie = Schema.Struct({
  imdbID: Schema.String,
  Title: Schema.String,
  Year: Schema.String,
  Rated: Schema.String,
  Runtime: Schema.String,
  Genre: Schema.String,
  Director: Schema.String,
  Actors: Schema.String,
  Plot: Schema.String,
  Language: Schema.String,
  Country: Schema.String,
  Poster: Schema.String,
  imdbRating: Schema.String,
  imdbVotes: Schema.String,
  Type: Schema.optional(Schema.String),
  totalSeasons: Schema.optional(Schema.String),
});
export type OmdbMovie = typeof OmdbMovie.Type;

export const Kind = Schema.Literal("movie", "series");
export type Kind = typeof Kind.Type;

export const Film = Schema.Struct({
  id: Schema.String,
  /** A Jev Choice caps at 255 options, so films and series are asked about separately. */
  kind: Kind,
  /** Position in the IMDb Top 250, from 1. The order the grid falls back to. */
  imdbRank: Schema.Int,
  title: Schema.String,
  year: Schema.Int,
  rated: Schema.String,
  runtime: Schema.Int,
  genres: Schema.Array(Schema.String),
  director: Schema.String,
  actors: Schema.Array(Schema.String),
  plot: Schema.String,
  languages: Schema.Array(Schema.String),
  countries: Schema.Array(Schema.String),
  /** The poster URL up to the size token; `posterUrl` appends the width the tile wants. */
  posterBase: Schema.String,
  imdbRating: Schema.Number,
  /** How many people rated it. A rating without this is not comparable across kinds. */
  imdbVotes: Schema.Number,
  /** Series only: how many seasons there are to get through. */
  seasons: Schema.optional(Schema.Int),
  /** Named by hand where it is worth searching for; OMDb carries no studio at all. */
  studio: Schema.optional(Schema.String),
});
export type Film = typeof Film.Type;

export const Catalog = Schema.Array(Film);

/** What the browser needs to rank and draw a tile. Plot and credits stay on the server. */
export const FilmCard = Film.pick(
  "id",
  "kind",
  "imdbRank",
  "title",
  "year",
  "rated",
  "runtime",
  "genres",
  /** The browser filters on these, so they ride along with the card. */
  "countries",
  /** Two films by one director are alike in a way no genre tag records. */
  "director",
  "posterBase",
  "imdbRating",
  "imdbVotes",
  "seasons",
);
export type FilmCard = typeof FilmCard.Type;

export const Cards = Schema.Array(FilmCard);

/** OMDb stands in "N/A" for any value it does not hold. */
const absent = (raw: string) => raw === "N/A" || raw.trim() === "";

/** "2,978,123" -> 2978123. Zero when OMDb has no count. */
export const parseVotes = (raw: string) =>
  absent(raw) ? 0 : Number.parseInt(raw.replace(/,/g, ""), 10) || 0;

/** "142 min" -> 142. Zero when OMDb has no runtime, which the grid reads as unknown. */
export const parseRuntime = (raw: string) => (absent(raw) ? 0 : (Number.parseInt(raw, 10) || 0));

/** "1994" and the series form "1994-1996" both yield the first year. */
export const parseYear = (raw: string) => Number.parseInt(raw, 10) || 0;

export const parseRating = (raw: string) => (absent(raw) ? 0 : (Number.parseFloat(raw) || 0));

/** "Crime, Drama" -> ["Crime", "Drama"]. */
export const parseList = (raw: string) =>
  absent(raw)
    ? []
    : raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

/**
 * OMDb returns two poster shapes, `..._V1_SX300.jpg` and `..._V1_QL75_UX380_CR0,4,380,562_.jpg`.
 * Both are the same image behind a size token, so strip the token and let each tile ask for the
 * width it needs. A grid of 250 at 600px would be 27MB; at 300px, lazily, it is a third of that.
 */
export const posterBase = (url: string) => (absent(url) ? "" : url.replace(/\._V1_.*\.jpg$/i, ""));

export const posterUrl = (base: string, width: 300 | 600) =>
  base === "" ? "" : `${base}._V1_SX${width}.jpg`;

export const fromOmdb = (raw: OmdbMovie, rank: number): Film => ({
  id: raw.imdbID,
  kind: raw.Type === "series" ? "series" : "movie",
  imdbRank: rank,
  title: raw.Title,
  year: parseYear(raw.Year),
  rated: absent(raw.Rated) ? "Not Rated" : raw.Rated,
  runtime: parseRuntime(raw.Runtime),
  genres: parseList(raw.Genre),
  director: absent(raw.Director) ? "" : raw.Director,
  actors: parseList(raw.Actors),
  plot: absent(raw.Plot) ? "" : raw.Plot,
  languages: parseList(raw.Language),
  countries: parseList(raw.Country),
  posterBase: posterBase(raw.Poster),
  imdbRating: parseRating(raw.imdbRating),
  imdbVotes: parseVotes(raw.imdbVotes),
  seasons: raw.totalSeasons === undefined || absent(raw.totalSeasons)
    ? undefined
    : Number.parseInt(raw.totalSeasons, 10) || undefined,
  studio: undefined,
});

/**
 * Exactly what `FILM_STATE_FIELDS` names, and the only thing the model is ever told about a
 * film. Lives here rather than in the labelling script so a test can hash it without running
 * the job, and so the list and its realization cannot drift apart.
 */
export const toState = (film: Film) => ({
  film: {
    title: film.title,
    year: film.year,
    director: film.director,
    starring: [...film.actors],
    genres: [...film.genres],
    plot: film.plot,
  },
});

export const toCard = (film: Film): FilmCard => ({
  id: film.id,
  kind: film.kind,
  imdbRank: film.imdbRank,
  title: film.title,
  year: film.year,
  rated: film.rated,
  runtime: film.runtime,
  genres: film.genres,
  countries: film.countries,
  director: film.director,
  posterBase: film.posterBase,
  imdbRating: film.imdbRating,
  imdbVotes: film.imdbVotes,
  seasons: film.seasons,
});

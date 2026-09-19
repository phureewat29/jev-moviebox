import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { subjectShards } from "@/core/Decisions";
import {
  Cards,
  Catalog,
  fromOmdb,
  parseList,
  parseRating,
  parseRuntime,
  parseYear,
  posterBase,
  posterUrl,
} from "@/core/Film";
import cards from "@/data/films.json";
import catalog from "@/data/catalog.json";

const films = Schema.decodeUnknownSync(Catalog)(catalog);

describe("parsers", () => {
  it("reads a runtime, and treats a gap as unknown", () => {
    expect(parseRuntime("142 min")).toBe(142);
    expect(parseRuntime("N/A")).toBe(0);
  });

  it("takes the first year of a series range", () => {
    expect(parseYear("1994")).toBe(1994);
    expect(parseYear("1994-1996")).toBe(1994);
  });

  it("splits a comma list and drops a gap", () => {
    expect(parseList("Crime, Drama")).toEqual(["Crime", "Drama"]);
    expect(parseList("N/A")).toEqual([]);
  });

  it("reads a rating", () => {
    expect(parseRating("9.3")).toBe(9.3);
    expect(parseRating("N/A")).toBe(0);
  });

  it("strips either poster shape back to one base", () => {
    const id = "https://m.media-amazon.com/images/M/MV5BMDFk";
    expect(posterBase(`${id}._V1_SX300.jpg`)).toBe(id);
    expect(posterBase(`${id}._V1_QL75_UX380_CR0,4,380,562_.jpg`)).toBe(id);
    expect(posterBase("N/A")).toBe("");
  });

  it("builds a poster at the width the tile asks for", () => {
    const id = "https://m.media-amazon.com/images/M/MV5BMDFk";
    expect(posterUrl(id, 300)).toBe(`${id}._V1_SX300.jpg`);
    expect(posterUrl(id, 600)).toBe(`${id}._V1_SX600.jpg`);
    expect(posterUrl("", 300)).toBe("");
  });

  it("turns an OMDb row into a film", () => {
    const film = fromOmdb(
      {
        imdbID: "tt0111161",
        Title: "The Shawshank Redemption",
        Year: "1994",
        Rated: "R",
        Runtime: "142 min",
        Genre: "Drama",
        Director: "Frank Darabont",
        Actors: "Tim Robbins, Morgan Freeman",
        Plot: "Two imprisoned men bond over a number of years.",
        Language: "English",
        Country: "United States",
        Poster: "https://m.media-amazon.com/images/M/x._V1_SX300.jpg",
        imdbRating: "9.3",
        imdbVotes: "2,978,123",
      },
      1,
    );
    expect(film).toMatchObject({ id: "tt0111161", imdbRank: 1, year: 1994, runtime: 142 });
    expect(film.genres).toEqual(["Drama"]);
    expect(film.actors).toEqual(["Tim Robbins", "Morgan Freeman"]);
  });
});

describe("the generated catalog", () => {
  it("holds films and series, each ranked within its own kind", () => {
    const movies = films.filter((film) => film.kind === "movie");
    const series = films.filter((film) => film.kind === "series");
    expect(movies.length).toBeGreaterThan(200);
    expect(series.length).toBeGreaterThan(100);
    for (const kind of ["movie", "series"] as const) {
      const ranks = films.filter((film) => film.kind === kind).map((film) => film.imdbRank);
      expect(ranks, kind).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));
    }
  });

  // the ceiling is per Choice, not per kind; asserting it per kind once capped the shelf at 254 films
  it("splits the catalog into Choices that each fit inside the 255-option ceiling", () => {
    const shards = subjectShards(films);
    expect(Object.keys(shards).length).toBeGreaterThan(2);
    for (const [id, shard] of Object.entries(shards)) {
      expect(Object.keys(shard.criteria).length, id).toBeLessThanOrEqual(255);
    }
    // every title reaches exactly one shard, so nothing silently falls off the shelf
    const offered = Object.values(shards).flatMap((shard) =>
      Object.keys(shard.criteria).filter((key) => key !== "none"),
    );
    expect(new Set(offered).size).toBe(films.length);
  });

  it("carries the Thai cinema that was added on purpose", () => {
    const thai = films.filter((film) => film.countries.includes("Thailand"));
    expect(thai.length).toBeGreaterThanOrEqual(25);
    for (const title of ["Bad Genius", "Pee Mak", "How to Make Millions Before Grandma Dies"]) {
      expect(films.some((film) => film.title === title), title).toBe(true);
    }
  });

  it("gives every title a distinct id", () => {
    expect(new Set(films.map((film) => film.id)).size).toBe(films.length);
  });

  it("leaves no gap in the fields the ranker and the grid read", () => {
    for (const film of films) {
      expect(film.title.length, film.id).toBeGreaterThan(0);
      expect(film.year, film.title).toBeGreaterThan(1900);
      // some series carry no runtime in OMDb; the ranker reads 0 as unknown
      expect(film.runtime, film.title).toBeGreaterThanOrEqual(0);
      expect(film.imdbRating, film.title).toBeGreaterThan(0);
      expect(film.genres.length, film.title).toBeGreaterThan(0);
    }
  });

  it("gives Jev enough plot to label from", () => {
    for (const film of films) expect(film.plot.length, film.title).toBeGreaterThan(60);
  });

  it("holds poster bases with the size token already stripped", () => {
    for (const film of films) {
      expect(film.posterBase, film.title).toMatch(/^https:\/\/m\.media-amazon\.com\//);
      expect(film.posterBase, film.title).not.toContain("_V1_");
    }
  });

  it("ships the browser a card per film and no plot", () => {
    const decoded = Schema.decodeUnknownSync(Cards)(cards);
    expect(decoded).toHaveLength(films.length);
    expect(decoded[0]).not.toHaveProperty("plot");
    expect(decoded.map((card) => card.id)).toEqual(films.map((film) => film.id));
  });
});

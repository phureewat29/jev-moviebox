import { existsSync, readFileSync } from "node:fs";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Cards } from "@/core/Film";
import { Labels } from "@/core/Labels";
import { rank, shortlist, type PersonRead } from "@/core/Rank";
import cards from "@/data/films.json";
import labelsFile from "@/data/labels.json";

/**
 * Every shelf the ranker produces for the cached reads, frozen. The refactor of Rank.ts is
 * allowed to change how the answer is computed and nothing about what the answer is; this is
 * what says so. Doubles round-trip JSON exactly, so a changed order of operations shows up.
 */
const films = Schema.decodeUnknownSync(Cards)(cards);
const labels = new Map(
  Schema.decodeUnknownSync(Labels)(labelsFile).films.map((row) => [row.id, row]),
);

type Cached = { said: string; company: string | null; read: PersonRead };
/** Built by `node scripts/tune.ts --read`, and not in the repository: without it there is nothing to freeze. */
const CACHE = "src/data/reads.cache.json";
const cache = existsSync(CACHE)
  ? (JSON.parse(readFileSync(CACHE, "utf8")) as readonly Cached[])
  : [];

const TIER: Record<number, string> = { 2: "named", 1: "kept", 0: "rest" };

describe.skipIf(cache.length === 0)("the golden shelves", () => {
  it("are what the cached reads still produce", async () => {
    const snapshot = Object.fromEntries(
      cache.map((row) => {
        const ranked = rank({ person: row.read, films, labels });
        const shelf = shortlist(ranked).map((r) => r.film.id);
        const mode = ranked.some((r) => r.tier === 2 && r.qualifies)
          ? "named"
          : ranked[0]?.browsing === true
            ? "browse"
            : "ranked";
        return [
          `${row.said}|${row.company ?? ""}`,
          {
            mode,
            shelf,
            rows: ranked.map((r) => [r.film.id, TIER[r.tier], r.qualifies, r.match, r.fit]),
          },
        ];
      }),
    );
    await expect(JSON.stringify(snapshot, null, 1)).toMatchFileSnapshot(
      "./__snapshots__/golden.json",
    );
  });
});

# Movie Box

A box of films for tonight, chosen with [Jev](https://docs.typesafe.ai). Say how the evening
feels in your own words, tap who is watching, and get the few titles that actually fit — or
nothing, when nothing does. No login, no account, no history.

Live at [moviebox.phureewat.com](https://moviebox.phureewat.com).

```
"long day, I just want to switch off"      → Friends · Queer Eye · Modern Family · Midnight Diner
"something like Interstellar, but shorter" → Inception · Infinity War · The Terminator
"jail breaking"                            → The Shawshank Redemption · Prison Break · The Great Escape
"a scary thai film" + kids watching        → nothing in the box fits that.
```

## How it works

One sentence goes to Jev, TypeSafe's System One model. It answers about fifty typed questions
about that sentence in a single call: ten taste axes as ordered ratings, a probability per
genre, which country or decade was named, whether a genre was *stated* or merely implied, and
which of the 744 titles the person is pointing at. It never writes prose.

Everything after that is ordinary code. The 744 titles were labelled on the same ten axes
offline, so ranking is arithmetic: lay the person's distribution over each film's and see what
overlaps. Two rules matter more than the rest.

**A title Jev names outranks any average.** Asked for "jail breaking", the model returns
Shawshank at 1.00 — feeding that into a weighted average where a genre tag could outvote it is
how the shelf ended up showing Prison Break instead.

**A contradiction returns nothing.** Ask to be scared with children in the room and the axis
carrying most of the weight is unmet by every kid-safe film, so the honest answer is an empty
shelf rather than the least-bad thing in stock.

The rubric lives in `src/core/Taste.ts` as data, `src/core/Decisions.ts` turns it into an
Effect `Decision` definition, and `src/core/Rank.ts` does the ranking — pure, no model calls,
and covered by a snapshot that fails if a refactor changes any shelf.

## Stack

| | |
| --- | --- |
| Runtime | Node 24, pnpm 11 |
| Web | Next 16 App Router, React 19, Tailwind 4, TypeScript `strict` |
| Core | [Effect](https://effect.website) 4, with `Decision` and `DecisionModel` from `effect/unstable/ai` |
| Model | Jev via `@effect/ai-typesafe`, server-side only |
| Data | IMDb Top 250 ids plus a curated list, enriched through [OMDb](https://www.omdbapi.com); committed JSON, no database |
| Tests | Vitest |

## Run

```bash
pnpm install
cp .env.example .env.local     # add TYPESAFE_API_KEY
pnpm dev                       # http://localhost:3000

pnpm test
pnpm typecheck
```

The catalog and its labels are committed, so a clone needs no OMDb key and runs no jobs. The
scripts that *build* them are deliberately not in this repository: they hold credentials and
only ever run on one machine.

## Licence

[MIT](LICENSE) © 2026 Phureewat A

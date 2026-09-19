# Movie Box

A box of films for tonight, chosen with [Jev](https://docs.typesafe.ai). Say how tonight feels and tap
who is watching; Jev reads that onto 10 taste axes; code compares it against 744 well-known
films and series and ranks them. No login needed.

## Run

Requires Node 24 and pnpm.

```bash
pnpm install
cp .env.example .env.local     # add TYPESAFE_API_KEY
pnpm dev                       # http://localhost:3000

pnpm test
pnpm typecheck
```

## Credits

The list starts from the IMDb Top 250 as captured by
[toedter/movies-demo](https://github.com/toedter/movies-demo) (MIT). Descriptions, posters and
metadata come from [OMDb](https://www.omdbapi.com).

## Deploy

Built for Vercel at [moviebox.phureewat.com](https://moviebox.phureewat.com). Import the
repository with the Next.js preset and set two environment variables:

| variable | value |
| --- | --- |
| `TYPESAFE_API_KEY` | your TypeSafe key |
| `TYPESAFE_TIMEOUT_MS` | optional, `12000` by default — the whole budget for one read; past it the page shows an empty shelf |

The model is not configurable: the server reads people with the version the labels were made
with (`jev-1.13.0`, pinned in `src/server/JevModel.ts`), because a read from a different model
would be compared against film answers from another one. Upgrading is one relabel run and a
one-line pin bump, together.

Point the domain at Vercel with a CNAME `moviebox → cname.vercel-dns.com`. Posters load from
IMDb's CDN, the data is committed JSON, and every model call is server-side, so nothing else
needs provisioning. The in-process rate limiter is a courtesy control that resets per instance;
it also assumes the platform overwrites `x-real-ip`, which Vercel does and a bare origin does not. For a hard limit, add a rate-limiting rule in the Vercel Firewall, and cap spend at TypeSafe.

The data jobs under `scripts/` are deliberately not in the repository — the catalog and the
labels are built on one machine and committed — so a clone runs without any OMDb key.

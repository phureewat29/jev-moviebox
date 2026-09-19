# Movie Box

A box of films for tonight, chosen with [Jev](https://docs.typesafe.ai). Say how tonight feels and tap
who is watching; Jev reads that onto 10 taste axes; code compares it against 250 well-known
films and ranks them, with the reason on each. No login needed.

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

The film list is the IMDb Top 250 as captured by
[toedter/movies-demo](https://github.com/toedter/movies-demo) (MIT). Descriptions, posters and
metadata come from [OMDb](https://www.omdbapi.com).

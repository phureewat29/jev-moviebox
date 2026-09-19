# Movie Box

A box of films for tonight, chosen with [Jev](https://docs.typesafe.ai). Say how the evening
feels in your own words, tap who is watching, and get the few titles that actually fit — or
nothing, when nothing does. No login, no account, no history.

Live at [moviebox.phureewat.com](https://moviebox.phureewat.com).

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

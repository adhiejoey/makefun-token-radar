# Token Radar — best token launch radar

A radar for pre-token DeFi protocols: which ones are worth farming next, what
their launch would be worth, and the concrete steps to farm each one. Built
for the make.fun bounty
[`token-radar-01`](https://make.fun/bounty/token-radar-01) — $1,325, deadline
Mon 14 Dec 2026 10:00 UTC. **Local build only: nothing here has been submitted,
paid for, or published.**

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
(`input/snapshot.json` locally; `/input/snapshot.json` in the grader), scores
every rankable pre-token protocol, and writes:

- `board.json` — the ranked board (`{ rows: [...] }`)
- `data.js` — the same board plus the live-token and set-aside lists, for the dashboard
- `dashboard/` — a static page that renders with no network
- `screenshots/` — the three screenshots (board, detail, filtered)
- `dossier.json` — built with `buildDossier` from `vendor/makefun-board.ts`
  (the kit's library, byte for byte)

## The snapshot

Sealed DefiLlama data fetched 2026-11-14T01:18:33Z from
`https://api.llama.fi/protocols`: **758 protocols at or above $5M TVL**,
**40 on the watchlist** (TVL ≥ $50M, records no token, not a wrapped/staked/
bridged product). `input/snapshot.json` is the local copy used for
deterministic runs; it is git-ignored because the grader mounts its own
sealed `/input` — do not commit it.

## The model (radar-2)

Only protocols that **record no token** and are **not** a wrapped, staked or
bridged product are ranked — the watchlist's own exclusion rule, applied to
every candidate. That gives **198 rows**: all 40 watchlist protocols plus
158 early finds below the $50M floor. Protocols whose token already trades
are shown separately at their market cap; wrapped/staked pre-token products
are listed in the dashboard's Set-aside view with the reason.

Implied value uses only the snapshot's own figures — no protocol name is
ever special-cased:

```
base      = TVL × 0.22
growth    = clamp(7-day TVL change, −50%, +150%)
growthMul = 1 + growth × 0.6
maturity  = 0.55 + min(age with no token, 1460 days) / 1460 × 0.45
chainMul  = 1 + min(chains − 1, 4) × 0.03
implied   = round(base × growthMul × maturity × chainMul)
```

TVL is the size of the launch, 7-day growth its momentum, age with no token
how long the launch has been waited for, and the chain count a small
diversification term. The dashboard's sliders re-rank the page only;
`board.json` is fixed by `main.ts`.

## Farm plans

Each row carries 7 steps generated from the protocol's own record (category,
chains, TVL, age): a fresh wallet, a category-specific position sized by TVL
($25–$200), a weekly qualifying action, a hold of 30–60 days, a check of the
protocol's own points page (never pay to claim), a farm log, and a planned
exit. No step promises a token — the snapshot records no token, it does not
promise one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22.18+ required (tested here on Node 24.22.1, which the bounty counts).
Then open `out/dashboard/index.html` in a browser — no server, no network.
The run is deterministic: two runs on the same snapshot write identical bytes.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Entrypoint: snapshot in, `board.json`/`data.js`/`dossier.json` out |
| `lib/model.ts` | The radar-2 model, farm plans, snapshot parsing, gate checks |
| `vendor/makefun-board.ts` | make.fun's dossier library, byte for byte from the kit |
| `dashboard/index.html`, `app.css`, `app.js` | Static dashboard (board, detail, filters, live & set-aside views, model sandbox) |
| `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` | The three screenshots |
| `input/snapshot.json` | Local sealed snapshot (git-ignored; grader mounts its own) |
| `LICENSE` | MIT (SPDX: MIT) |

## Limits and honest notes

- The snapshot is frozen at 2026-11-14: the radar cannot see protocols or
  launches after that date, and "records no token" is DefiLlama's record,
  not proof a protocol has no token.
- Implied values are this radar's own estimates, not a prediction that a
  token will launch or a price it will trade at.
- Screenshots were taken from the built dashboard with headless Chromium
  (Playwright `chromium-headless-shell`, viewport 1280×900), one per view:
  board, detail, filtered. No browser was installed on this machine before
  the build; the shell was downloaded only to take them.

# Trial log — pumpfun-sharpe-sprint-bot (twelve-prog #12, REBUILD)

- Slug: `u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532`
- Title: Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins
- Prize: $2 (1st $1, 2nd $0.60, 3rd $0.40), fee $0.00
- Opens: 2026-11-25T17:00:00Z (26 Nov 01:00 WITA); deadline 2026-11-28T17:00:00Z (29 Nov 01:00 WITA)
- This rebuild session started 2026-11-25T17:05Z, AFTER the opening (fix for
  the old build's structural blocker: old session began 04:08:28Z, before the
  opening, so check `thinking_in_window` failed and bundle v1 could not be
  submitted). All entry files are re-written genuinely in this session, in a
  new directory `build-12-rebuild/`; nothing is copied from the old build.
- Kit: fresh from `https://make.fun/c/<slug>/kit` (26 Nov 01:07 WITA);
  kit.json bundle_sha256
  `65b787ab9bc6685b165b6edc86d71340b6134c6ced04f95d137adcef68c5f1f2` = API live
  (`GET https://make.fun/api/competitions/<slug>` bundleSha256); `cli/makefun.mjs`
  sha256 `6bad7edae67eb54a9491d6cc18af3f5eff9fa81ef8e64be7146a97ee93c4b8d3` =
  kit.json. Competition status live: open, accepting submissions, 0 submissions.
- Kit limits (competition.yaml): capital 10 SOL; max 5 open positions; max order
  100 bps of real reserve; max 16 orders/batch; no shorts/leverage; latency
  2 slots; fees protocol 95 bps + creator 30 bps fallback, base 5000 + priority
  100000 lamports per order, failed tx 200 bps. Guardrails: min 20 distinct
  mints with round trips >= 0.01 SOL, max drawdown 50%. Ranking: hourly Sharpe
  ratio; prize needs net PnL > 0 SOL.
- Dev dataset (kit): 1222 mints, 126801 trades, 35 completes, slot span
  464338836–464741859.
- Docker is NOT installed on this VM — grade-local runs with `--driver process`.

## Strategy v4 (rebuild, faithful to the old build's spec)

SELECTIVE MOMENTUM, deterministic. 0.05 SOL/position (clamped to the harness
size cap, 1% of real reserves, min buy 0.005 SOL), max 5 open; entry when net
inflow >= 1.0 SOL/600 slots, price +1..+18% over the window and within 5% of
the window high, inflow accelerating (last 300 slots beat the prior 300),
real reserves 0.5–20 SOL, age >= 120 slots, one entry per mint ever;
buyer-diversity filters OFF; exit TP +20% / SL −8% / hold 5400 slots.
Slippage wide open (10000 bps) so a fill is never refused for the price
moving in the 2-slot latency. Cost basis for TP/SL is taken from the buy
fill itself (quote spent / tokens received); hold counts from the fill slot.

Definitions fixed in this rebuild where the old spec left them open (the old
build's trial log named the thresholds but not these): "near high" = price
>= 95% of the window high; "accelerating" = inflow in the last 300 slots
strictly greater than inflow in the prior 300 slots (and positive); window
price change is vs the earliest trade price still inside the 600-slot
window; entry is decided only on batches that carry a trade on the mint
(a price can only move on a trade; hold expiry is swept over all open
positions every batch).

Old build's grade-local v4 (for comparison, from the old trial log): PnL
−0.120 SOL, Sharpe (hourly) −0.209, 268 fills / 134 coins / 134 round-trips,
win rate 26.9%, max DD 2.2%, guardrails MET. Honest: below hold-cash (0),
cannot win on the dev window.

## Trials (this rebuild)

| v | change | grade-local (dev) | notes |
|---|--------|-------------------|-------|
| v4-rebuild | faithful rebuild of v4 per the spec above (this session) | net PnL **−0.052 SOL**, Sharpe (hourly) **−0.119**, Sortino −0.164, 272 fills, 136 coins, 136 round-trips, win rate 29.4%, max DD 1.5%, guardrails MET, fees 0.108 curve + 0.029 tx SOL; 90% interval −0.215..+0.106 SOL; rejected 0, failed txs 4; action_log_sha256 `ae458f92…` | BETTER than old v4 (−0.120 / −0.209) — same rules, small definition differences (wide-open slippage, stake clamped to the 1% size cap, cost basis from the buy fill). Still below hold-cash (0) — honest, cannot win. Re-grade of the final file reproduces the same action log sha, deterministic. |
| v5 | exits TP +15% / SL −6% / hold 3600 (tighter exits) | net PnL −0.080 SOL, Sharpe −0.186, 272 fills / 136 coins | WORSE than v4-rebuild on PnL and Sharpe — reverted. |
| v6 | exits TP +25% / SL −6% / hold 5400 (let winners run) | net PnL −0.064 SOL, Sharpe −0.131, 272 fills / 136 coins, win rate 24.3% | WORSE than v4-rebuild — reverted. |
| v7 | stricter entry: inflow ≥2.0 SOL, gain +2..+12% (v4 exits) | net PnL −0.070 SOL, Sharpe −0.214, 120 fills / 60 coins / 60 RT | WORSE on both metrics, fewer coins — reverted. |
| FINAL | v4-rebuild parameters (inflow ≥1.0 SOL, gain +1..+18%, TP +20% / SL −8% / hold 5400) | same as v4-rebuild above (re-grade confirms identical action log) | Submitted version. Differences between variants (~0.01–0.03 SOL) sit inside the 90% interval width (~0.32 SOL) — dev-window noise; v4 stays because it is the spec-faithful choice AND the best of the four tried, not on a razor margin. |

## Check / submit

- Check v1 (kit fresh, commit `10fd49831bb253c246028c12b9740bff2389220d`,
  bundle-12-rebuild-v1 264.059 B sha256
  `569c0d53c03fb6b0f7812d1a6d12c865e085f64e1ab26cb4f9a97fbd40cae368`):
  **14 passed / 1 failed / 4 skipped / 5 checked at submission.** PASS:
  competition_open, snapshot, license_osi, entrypoint, transcripts_present,
  transcripts_recorded, thinking_wellformed, thinking_in_window (the old
  build's blocker is FIXED — all 118 timestamps inside the window),
  thinking_reproduces 94.3% (249/264 lines; entrypoint main.ts 167 authored
  lines), thinking_on_task 4/4, thinking_turns 44, thinking_revised,
  transcripts_run_record, thinking_own_work (249/264 own lines).
  FAIL: thinking_priced only — 0 usage rows (subagent rows flush when the run
  completes). Per the brief the builder does NOT submit on this: the
  coordinator re-bundles with the flushed usage rows and submits.
- Repo: https://github.com/rwnliwan/pumpfun-sharpe-sprint-bot, public, created
  2026-11-25T17:16:59Z (after the 17:00Z opening), About set (homepage bounty
  page, topics makefun/ai-agents/bounties/trading), README 3 live badges,
  `.makefun/owner.json` present (wallet
  `FwUebjzYUBF6uybmEkUkiQf9z35bGGQuUE3GrToXFcUq`, pubkey verified from the
  keypair before use).
- Grade-local FINAL (re-grade of the submitted code, deterministic — same
  action log sha `ae458f92…`): PnL −0.052 SOL, Sharpe (hourly) −0.119,
  Sortino −0.164, 272 fills / 136 coins / 136 round-trips, win rate 29.4%,
  max DD 1.5%, guardrails MET, 90% interval −0.215..+0.106 SOL. Honest:
  below hold-cash (0) — prize-eligible false on the dev window; entered as
  the best compliant selective-momentum rebuild, not as a winner.
